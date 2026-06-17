'use strict';

// CLOUD-FOUNDATION-1F.4A/1F.4B — Cloud Backup Readiness + Manual Upload.
//
// getCloudBackupReadiness() / derivePreflightMetadata() remain READ-ONLY / pure
// (1F.4A, frozen behavior — never upload, never write cloud_backups/audit_logs).
//
// createManualCloudBackup() (1F.4B) is the first guarded WRITE path. It only
// runs on an explicit caller request (the IPC layer is only invoked when the
// user clicks the manual backup button — there is no timer/startup/focus
// trigger anywhere in this module). It:
//   • re-confirms auth + role immediately before upload (fresh preflight)
//   • uploads the already-built .ktpbackup archive to the ktp-backups bucket
//   • calls create_cloud_backup_metadata only after a successful upload
//   • best-effort deletes the uploaded object if the metadata write fails
// It NEVER restores, never calls create_backup_download_url, never calls
// snapshot/lock RPCs, and never returns a token/device id/storage path/raw
// checksum to its caller.

const crypto = require('crypto');
const { isConfigured, getSupabaseUrl, getBaseHeaders } = require('./cloud-config');
const _defaultAuth      = require('./cloud-auth');
const _defaultWorkspace = require('./cloud-workspace');

// ── Constants ────────────────────────────────────────────────────────────────
// Matches the ktp-backups bucket file_size_limit (104857600) and the local
// MAX_KTPBACKUP_BYTES cap in main.js.
const MAX_CLOUD_BACKUP_BYTES = 100 * 1024 * 1024;
// Roles permitted to create a cloud backup (mirrors create_cloud_backup_metadata
// and the ktp-backups insert storage policy).
const BACKUP_ROLES   = ['owner', 'admin', 'editor'];
const VALID_TRIGGERS = ['manual', 'auto', 'pre_restore', 'migration'];
const CHECKSUM_RE    = /^[0-9a-f]{64}$/;
const BACKUP_BUCKET  = 'ktp-backups';

// ── Test seams ───────────────────────────────────────────────────────────────
let _authImpl      = null;
let _workspaceImpl = null;
let _fetchImpl      = null;

function _setAuth(a)      { _authImpl      = a || null; }
function _setWorkspace(w) { _workspaceImpl = w || null; }
function _setFetch(fn)    { _fetchImpl      = fn || null; }
function _resetForTests() { _authImpl = null; _workspaceImpl = null; _fetchImpl = null; }

function _auth()      { return _authImpl      || _defaultAuth; }
function _workspace() { return _workspaceImpl || _defaultWorkspace; }
function _doFetch(url, opts) { return (_fetchImpl || global.fetch)(url, opts); }

// ── Validation helpers ───────────────────────────────────────────────────────

function _validateWorkspaceId(id) {
  if (typeof id !== 'string') return false;
  return id.trim().length > 0;
}

// Derives a safe storage path WITHOUT including any device id or secret.
// idSuffix defaults to 'pending' for preflight-only callers (1F.4A, unchanged
// shape). Real uploads (1F.4B) pass an opaque random suffix — never a device id.
function _safeStoragePath(workspaceId, idSuffix) {
  var ws = String(workspaceId || '').trim();
  var ts = new Date().toISOString().replace(/[:.]/g, '-');
  var suffix = (typeof idSuffix === 'string' && idSuffix) ? idSuffix : 'pending';
  return 'workspaces/' + ws + '/' + ts + '_' + suffix + '.ktpbackup';
}

// ── getCloudBackupReadiness (read-only) ──────────────────────────────────────
// Resolves whether the caller can create a cloud backup for the given workspace.
// Reads role via listWorkspaces() (a GET). Performs NO writes.

async function getCloudBackupReadiness(workspaceId) {
  if (!isConfigured()) return { ok: false, error: 'not_configured' };
  if (!_validateWorkspaceId(workspaceId)) return { ok: false, error: 'invalid_input' };

  var meta = _auth().getSessionMeta();
  if (!meta || !meta.ok) return { ok: false, error: 'not_authenticated' };

  var listRes;
  try {
    listRes = await _workspace().listWorkspaces();
  } catch (_) {
    return { ok: false, error: 'network_error' };
  }
  if (!listRes || !listRes.ok) {
    return { ok: false, error: (listRes && listRes.error) || 'unknown_error' };
  }

  var target = (listRes.workspaces || []).find(function(w) {
    return w.workspaceId === workspaceId.trim();
  });
  if (!target) return { ok: false, error: 'workspace_not_found' };

  var role = target.memberRole || null;
  var canBackup = BACKUP_ROLES.indexOf(role) !== -1;

  // Never returns device id, tokens, storage paths, or service keys.
  return {
    ok:        true,
    role:      role,
    canBackup: canBackup,
    maxBytes:  MAX_CLOUD_BACKUP_BYTES,
  };
}

// ── derivePreflightMetadata (pure, no network) ───────────────────────────────
// Validates a locally-built backup descriptor and derives the metadata shape +
// storage path a future upload would use. NEVER contacts the cloud.

function derivePreflightMetadata(input) {
  input = input || {};

  var workspaceId = typeof input.workspaceId === 'string' ? input.workspaceId.trim() : '';
  if (!workspaceId) return { ok: false, error: 'invalid_input' };

  var byteSize = input.byteSize;
  if (typeof byteSize !== 'number' || !isFinite(byteSize) ||
      byteSize <= 0 || Math.floor(byteSize) !== byteSize) {
    return { ok: false, error: 'invalid_byte_size' };
  }

  var checksum = typeof input.checksum === 'string' ? input.checksum : '';
  if (!CHECKSUM_RE.test(checksum)) return { ok: false, error: 'invalid_checksum' };

  var trigger = input.trigger || 'manual';
  if (VALID_TRIGGERS.indexOf(trigger) === -1) return { ok: false, error: 'invalid_trigger' };

  var formatVersion = typeof input.formatVersion === 'number' ? input.formatVersion : 1;
  if (formatVersion < 1) return { ok: false, error: 'invalid_format_version' };

  var withinLimit = byteSize <= MAX_CLOUD_BACKUP_BYTES;
  var storagePath = _safeStoragePath(workspaceId);

  // The metadata shape that create_cloud_backup_metadata WOULD receive in 1F.4B.
  // Assembled here only to validate its shape — never sent.
  var metadata = {
    p_workspace_id:   workspaceId,
    p_storage_path:   storagePath,
    p_byte_size:      byteSize,
    p_checksum:       checksum,
    p_backup_trigger: trigger,
    p_format_version: formatVersion,
  };
  if (typeof input.appVersion === 'string' && input.appVersion) {
    metadata.p_app_version = input.appVersion.slice(0, 32);
  }

  return {
    ok:            true,
    withinLimit:   withinLimit,
    byteSize:      byteSize,
    checksumValid: true,
    metadataValid: true,
    trigger:       trigger,
    formatVersion: formatVersion,
    maxBytes:      MAX_CLOUD_BACKUP_BYTES,
    // Internal-only fields (stripped at the IPC boundary before reaching renderer):
    storagePath:   storagePath,
    metadata:      metadata,
  };
}

// Maps a derivePreflightMetadata() validation error onto the 1F.4B error
// vocabulary (checksum_failed / backup_build_failed) so callers never leak the
// internal "invalid_*" shape-validation codes.
function _mapDerivedError(code) {
  if (code === 'invalid_checksum') return 'checksum_failed';
  if (code === 'invalid_byte_size' || code === 'invalid_input' ||
      code === 'invalid_trigger'   || code === 'invalid_format_version') {
    return 'backup_build_failed';
  }
  return code || 'unknown_error';
}

// ── Auth header helpers (mirrors cloud-workspace.js _buildHeaders) ──────────────

async function _buildAuthHeaders(isWrite) {
  var token = await _auth().getAccessToken();
  if (!token) return null;
  var h = Object.assign({}, getBaseHeaders());
  h['Authorization'] = 'Bearer ' + token;
  if (isWrite) h['Content-Profile'] = 'ktp';
  return h;
}

// ── Storage upload / cleanup (1F.4B) ─────────────────────────────────────────

async function _uploadArchive(storagePath, archiveStr, headers) {
  var url = getSupabaseUrl() + '/storage/v1/object/' + BACKUP_BUCKET + '/' + storagePath;
  // Override Content-Type: bucket allows only application/octet-stream.
  var h = Object.assign({}, headers, { 'Content-Type': 'application/octet-stream' });
  var res;
  try {
    res = await _doFetch(url, { method: 'POST', headers: h, body: archiveStr });
  } catch (_) {
    return { ok: false, error: 'network_error' };
  }
  if (!res.ok) return { ok: false, error: 'upload_failed' };
  return { ok: true };
}

// Best-effort cleanup of an orphaned object after a failed metadata write.
// Returns {ok:true} only if the delete request itself succeeded.
async function _deleteUploadedObject(storagePath, headers) {
  var url = getSupabaseUrl() + '/storage/v1/object/' + BACKUP_BUCKET;
  try {
    var res = await _doFetch(url, {
      method:  'DELETE',
      headers: headers,
      body:    JSON.stringify({ prefixes: [storagePath] }),
    });
    return { ok: res.ok === true };
  } catch (_) {
    return { ok: false };
  }
}

async function _writeBackupMetadata(metadataPayload, headers) {
  var url = getSupabaseUrl() + '/rest/v1/rpc/create_cloud_backup_metadata';
  var res, body;
  try {
    res  = await _doFetch(url, { method: 'POST', headers: headers, body: JSON.stringify(metadataPayload) });
    body = await res.json();
  } catch (_) {
    return { ok: false, error: 'network_error' };
  }
  if (!res.ok || !body || body.ok !== true) {
    return { ok: false, error: 'metadata_failed' };
  }
  return { ok: true, backupId: body.backup_id };
}

// ── createManualCloudBackup (1F.4B, guarded write path) ──────────────────────
// Caller (cloud-backup-ipc.js) only invokes this in direct response to an
// explicit user click — never on a timer, startup, or focus event.
//
// input: { workspaceId, archiveStr, byteSize, checksum, appVersion }
//   archiveStr/byteSize/checksum are produced by main.js from the EXISTING
//   local .ktpbackup builder (buildFullBackup); this module never builds or
//   reads local files itself.
//
// Never restores, never calls create_backup_download_url, never calls a
// snapshot/lock RPC, and never returns a token/device id/storage path/raw
// checksum.

async function createManualCloudBackup(input) {
  input = input || {};
  if (!isConfigured()) return { ok: false, error: 'not_configured' };

  var workspaceId = typeof input.workspaceId === 'string' ? input.workspaceId.trim() : '';
  if (!_validateWorkspaceId(workspaceId)) return { ok: false, error: 'invalid_input' };

  // Step 1 — re-run preflight immediately before touching storage.
  var readiness = await getCloudBackupReadiness(workspaceId);
  if (!readiness.ok) {
    return { ok: false, error: readiness.error === 'workspace_not_found' ? 'no_active_workspace' : readiness.error };
  }
  if (!readiness.canBackup) return { ok: false, error: 'permission_denied' };

  if (typeof input.archiveStr !== 'string' || !input.archiveStr) {
    return { ok: false, error: 'backup_build_failed' };
  }

  var derived = derivePreflightMetadata({
    workspaceId: workspaceId,
    byteSize:    input.byteSize,
    checksum:    input.checksum,
    trigger:     'manual',
    appVersion:  input.appVersion,
  });
  if (!derived.ok) return { ok: false, error: _mapDerivedError(derived.error) };
  if (!derived.withinLimit) return { ok: false, error: 'backup_too_large' };

  var uploadHeaders = await _buildAuthHeaders(false);
  if (!uploadHeaders) return { ok: false, error: 'not_authenticated' };

  // Opaque per-upload suffix — never a device id, never derived from secrets.
  var backupSuffix = crypto.randomBytes(8).toString('hex');
  var storagePath  = _safeStoragePath(workspaceId, backupSuffix);

  // Step 2 — upload the archive.
  var uploadResult = await _uploadArchive(storagePath, input.archiveStr, uploadHeaders);
  if (!uploadResult.ok) return { ok: false, error: uploadResult.error || 'upload_failed' };

  // Step 3 — write metadata only after a successful upload.
  var rpcHeaders = await _buildAuthHeaders(true);
  if (!rpcHeaders) return { ok: false, error: 'not_authenticated' };

  var metadataPayload = {
    p_workspace_id:   workspaceId,
    p_storage_path:   storagePath,
    p_byte_size:      derived.byteSize,
    p_checksum:       input.checksum,
    p_backup_trigger: 'manual',
    p_format_version: derived.formatVersion,
  };
  if (typeof input.appVersion === 'string' && input.appVersion) {
    metadataPayload.p_app_version = input.appVersion.slice(0, 32);
  }

  var metaResult = await _writeBackupMetadata(metadataPayload, rpcHeaders);
  if (!metaResult.ok) {
    // Metadata write failed AFTER a successful upload — attempt best-effort
    // cleanup so we never leave a silently orphaned object without reporting it.
    var cleanup = await _deleteUploadedObject(storagePath, uploadHeaders);
    return { ok: false, error: cleanup.ok ? 'metadata_failed' : 'cleanup_failed' };
  }

  // Step 4 — sanitized success. Never returns storagePath/checksum/device id.
  return {
    ok:        true,
    backupId:  typeof metaResult.backupId === 'string' ? metaResult.backupId : null,
    createdAt: new Date().toISOString(),
    byteSize:  derived.byteSize,
    trigger:   'manual',
  };
}

// ── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  getCloudBackupReadiness,
  derivePreflightMetadata,
  createManualCloudBackup,
  MAX_CLOUD_BACKUP_BYTES,
  BACKUP_ROLES,
  VALID_TRIGGERS,
  // Test seams
  _setAuth,
  _setWorkspace,
  _setFetch,
  _resetForTests,
  // Exported for unit tests
  _validateWorkspaceId,
  _safeStoragePath,
};
