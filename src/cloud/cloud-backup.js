'use strict';

// CLOUD-FOUNDATION-1F.4A — Cloud Backup Readiness + Preflight (READ-ONLY).
//
// This module performs ONLY read-only / preflight checks. It NEVER:
//   • uploads a file to storage
//   • calls create_cloud_backup_metadata
//   • writes the cloud_backups table
//   • writes audit_logs
//   • mutates any table or storage object
//
// getCloudBackupReadiness() performs a single read (listWorkspaces, a GET) to
// resolve the caller's role. derivePreflightMetadata() is a PURE function with
// no network access at all — it validates a locally-built backup descriptor and
// derives the metadata shape / storage path that a FUTURE upload phase (1F.4B)
// would use, without contacting the cloud.

const { isConfigured } = require('./cloud-config');
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

// ── Test seams ───────────────────────────────────────────────────────────────
let _authImpl      = null;
let _workspaceImpl = null;

function _setAuth(a)      { _authImpl      = a || null; }
function _setWorkspace(w) { _workspaceImpl = w || null; }
function _resetForTests() { _authImpl = null; _workspaceImpl = null; }

function _auth()      { return _authImpl      || _defaultAuth; }
function _workspace() { return _workspaceImpl || _defaultWorkspace; }

// ── Validation helpers ───────────────────────────────────────────────────────

function _validateWorkspaceId(id) {
  if (typeof id !== 'string') return false;
  return id.trim().length > 0;
}

// Derives a safe, deterministic-shape storage path WITHOUT including any device
// id or secret. The real per-device path is built at actual-upload time (1F.4B);
// here we only prove a valid path can be derived.
function _safeStoragePath(workspaceId) {
  var ws = String(workspaceId || '').trim();
  var ts = new Date().toISOString().replace(/[:.]/g, '-');
  return 'workspaces/' + ws + '/' + ts + '_pending.ktpbackup';
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

// ── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  getCloudBackupReadiness,
  derivePreflightMetadata,
  MAX_CLOUD_BACKUP_BYTES,
  BACKUP_ROLES,
  VALID_TRIGGERS,
  // Test seams
  _setAuth,
  _setWorkspace,
  _resetForTests,
  // Exported for unit tests
  _validateWorkspaceId,
  _safeStoragePath,
};
