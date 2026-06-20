'use strict';

// CLOUD-FOUNDATION-1G.2 — Real Sync: auto-push whole-workspace snapshot with CAS.
//
// This is a SEPARATE path from cloud backup. It does NOT touch ktp-backups, the
// cloud_backups table, or any backup/apply behavior. It pushes the local
// whole-workspace snapshot to the ktp-snapshots bucket and records a new revision
// via the existing ktp.push_snapshot_with_revision_check RPC (compare-and-swap).
//
// Push contract (all primitives already exist server-side — NO schema migration):
//   1. role gate (owner/admin/editor; viewer rejected before any network write)
//   2. acquire_lock(workspace_id, device_id)            → lease_token | locked
//   3. upload snapshot bytes to ktp-snapshots           → storage_path
//   4. push_snapshot_with_revision_check(base_revision) → new_revision | stale
//   5. release_lock(lease_token)                        (best effort, in finally)
//
// CAS guarantee: the push is rejected with a NON-DESTRUCTIVE 'stale_revision'
// result when another device advanced the revision. This module NEVER pulls,
// NEVER applies, and NEVER overwrites local DATA. It NEVER returns a token,
// lease token, storage path, raw hash, or device id to its caller.

const crypto = require('crypto');
const { isConfigured, getSupabaseUrl, getBaseHeaders } = require('./cloud-config');
const _defaultAuth      = require('./cloud-auth');
const _defaultWorkspace = require('./cloud-workspace');

// ── Constants ────────────────────────────────────────────────────────────────
const MAX_SNAPSHOT_BYTES = 100 * 1024 * 1024; // mirrors ktp-snapshots bucket limit
const PUSH_ROLES         = ['owner', 'admin', 'editor']; // viewer cannot push
const SNAPSHOT_BUCKET    = 'ktp-snapshots';
const HASH_RE            = /^[0-9a-f]{64}$/;
const LEASE_SECONDS      = 120; // short lease — a single push is fast

// ── Test seams ───────────────────────────────────────────────────────────────
let _authImpl      = null;
let _workspaceImpl = null;
let _fetchImpl     = null;

function _setAuth(a)      { _authImpl      = a  || null; }
function _setWorkspace(w) { _workspaceImpl = w  || null; }
function _setFetch(fn)    { _fetchImpl     = fn || null; }
function _resetForTests() { _authImpl = null; _workspaceImpl = null; _fetchImpl = null; }

function _auth()      { return _authImpl      || _defaultAuth; }
function _workspace() { return _workspaceImpl || _defaultWorkspace; }
function _doFetch(url, opts) { return (_fetchImpl || global.fetch)(url, opts); }

// ── Helpers ──────────────────────────────────────────────────────────────────

function _validateWorkspaceId(id) {
  return typeof id === 'string' && id.trim().length > 0;
}

function _isNonNegInt(n) {
  return typeof n === 'number' && isFinite(n) && n >= 0 && Math.floor(n) === n;
}

// Deterministic snapshot path: workspaces/{ws}/{revision}_{hash}.ktpsnap
// (matches the ktp-snapshots editor-insert storage policy convention).
function _snapshotPath(workspaceId, revision, hash) {
  return 'workspaces/' + String(workspaceId).trim() + '/' + revision + '_' + hash + '.ktpsnap';
}

async function _buildAuthHeaders(isWrite) {
  var token = await _auth().getAccessToken();
  if (!token) return null;
  var h = Object.assign({}, getBaseHeaders());
  h['Authorization'] = 'Bearer ' + token;
  h[isWrite ? 'Content-Profile' : 'Accept-Profile'] = 'ktp';
  return h;
}

async function _rpc(name, payload, headers) {
  var res, body;
  try {
    res  = await _doFetch(getSupabaseUrl() + '/rest/v1/rpc/' + name, {
      method:  'POST',
      headers: headers,
      body:    JSON.stringify(payload),
    });
    body = await res.json();
  } catch (_) {
    return { ok: false, error: 'network_error' };
  }
  if (!res.ok) return { ok: false, error: 'network_error' };
  return body || { ok: false, error: 'unknown_error' };
}

async function _uploadSnapshot(storagePath, snapshotStr, headers) {
  var url = getSupabaseUrl() + '/storage/v1/object/' + SNAPSHOT_BUCKET + '/' + storagePath;
  var h = Object.assign({}, headers, { 'Content-Type': 'application/octet-stream' });
  var res;
  try {
    res = await _doFetch(url, { method: 'POST', headers: h, body: snapshotStr });
  } catch (_) {
    return { ok: false, error: 'network_error' };
  }
  if (!res.ok) return { ok: false, error: 'upload_failed' };
  return { ok: true };
}

// Best-effort cleanup of an orphaned object after a failed/stale CAS push.
async function _deleteSnapshotObject(storagePath, headers) {
  var url = getSupabaseUrl() + '/storage/v1/object/' + SNAPSHOT_BUCKET;
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

// Resolves the caller's member role for the workspace (a GET, no writes).
async function _resolveRole(workspaceId) {
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
  return { ok: true, role: target.memberRole || null };
}

// ── pushWorkspaceSnapshot (guarded write — auto-push) ─────────────────────────
// input: { workspaceId, baseRevision, snapshotStr, byteSize, snapshotHash,
//          deviceId?, appVersion? }
// Returns ONLY safe fields:
//   success → { ok:true, newRevision, pushedAt }
//   stale   → { ok:false, error:'stale_revision', currentRevision }
//   else    → { ok:false, error:<category> }
async function pushWorkspaceSnapshot(input) {
  input = input || {};
  if (!isConfigured()) return { ok: false, error: 'not_configured' };

  var workspaceId = typeof input.workspaceId === 'string' ? input.workspaceId.trim() : '';
  if (!_validateWorkspaceId(workspaceId)) return { ok: false, error: 'invalid_input' };
  if (!_isNonNegInt(input.baseRevision))  return { ok: false, error: 'invalid_base_revision' };
  if (typeof input.snapshotStr !== 'string' || !input.snapshotStr) {
    return { ok: false, error: 'invalid_snapshot' };
  }
  if (!_isNonNegInt(input.byteSize) || input.byteSize <= 0) {
    return { ok: false, error: 'invalid_byte_size' };
  }
  if (input.byteSize > MAX_SNAPSHOT_BYTES) return { ok: false, error: 'snapshot_too_large' };
  if (typeof input.snapshotHash !== 'string' || !HASH_RE.test(input.snapshotHash)) {
    return { ok: false, error: 'invalid_snapshot_hash' };
  }

  var meta = _auth().getSessionMeta();
  if (!meta || !meta.ok) return { ok: false, error: 'not_authenticated' };

  // Step 1 — role gate BEFORE any network write (server re-enforces via RLS).
  var roleRes = await _resolveRole(workspaceId);
  if (!roleRes.ok) {
    return { ok: false, error: roleRes.error === 'workspace_not_found' ? 'no_active_workspace' : roleRes.error };
  }
  if (PUSH_ROLES.indexOf(roleRes.role) === -1) return { ok: false, error: 'permission_denied' };

  var writeHeaders = await _buildAuthHeaders(true);
  if (!writeHeaders) return { ok: false, error: 'not_authenticated' };
  var uploadHeaders = await _buildAuthHeaders(false);
  if (!uploadHeaders) return { ok: false, error: 'not_authenticated' };

  var deviceId = (typeof input.deviceId === 'string' && input.deviceId) ? input.deviceId : null;

  // Step 2 — acquire the workspace lease (serializes concurrent pushes).
  var lockRes = await _rpc('acquire_lock', {
    p_workspace_id:  workspaceId,
    p_device_id:     deviceId,
    p_lease_seconds: LEASE_SECONDS,
  }, writeHeaders);
  if (!lockRes || lockRes.ok !== true) {
    var le = (lockRes && lockRes.error) || 'unknown_error';
    if (le === 'locked')            return { ok: false, error: 'locked' };
    if (le === 'permission_denied') return { ok: false, error: 'permission_denied' };
    if (le === 'network_error')     return { ok: false, error: 'network_error' };
    return { ok: false, error: 'lock_failed' };
  }
  var leaseToken = lockRes.lease_token;

  var storagePath = _snapshotPath(workspaceId, input.baseRevision + 1, input.snapshotHash);

  try {
    // Step 3 — upload the snapshot bytes.
    var up = await _uploadSnapshot(storagePath, input.snapshotStr, uploadHeaders);
    if (!up.ok) return { ok: false, error: up.error || 'upload_failed' };

    // Step 4 — CAS push (only succeeds if base_revision == server current).
    var pushRes = await _rpc('push_snapshot_with_revision_check', {
      p_workspace_id:  workspaceId,
      p_lease_token:   leaseToken,
      p_base_revision: input.baseRevision,
      p_storage_path:  storagePath,
      p_snapshot_hash: input.snapshotHash,
      p_byte_size:     input.byteSize,
      p_device_id:     deviceId,
    }, writeHeaders);

    if (pushRes && pushRes.ok === true) {
      return {
        ok:          true,
        newRevision: typeof pushRes.new_revision === 'number' ? pushRes.new_revision : (input.baseRevision + 1),
        pushedAt:    new Date().toISOString(),
      };
    }

    // Stale CAS — another device advanced the revision. NON-DESTRUCTIVE: we do not
    // pull or overwrite. Clean up the orphaned object (best effort) and report.
    if (pushRes && pushRes.error === 'stale') {
      _deleteSnapshotObject(storagePath, uploadHeaders);
      return {
        ok:              false,
        error:           'stale_revision',
        currentRevision: typeof pushRes.current_revision === 'number' ? pushRes.current_revision : null,
      };
    }

    // Any other push failure — clean up the orphan and map a safe category.
    _deleteSnapshotObject(storagePath, uploadHeaders);
    var pe = (pushRes && pushRes.error) || 'unknown_error';
    if (pe === 'permission_denied' || pe === 'not_member') return { ok: false, error: 'permission_denied' };
    if (pe === 'network_error') return { ok: false, error: 'network_error' };
    if (pe === 'locked' || pe === 'invalid_lease_token' || pe === 'not_lock_holder' || pe === 'lease_expired') {
      return { ok: false, error: 'lock_lost' };
    }
    return { ok: false, error: 'push_failed' };
  } finally {
    // Step 5 — always release the lease (best effort; never throws).
    try {
      await _rpc('release_lock', { p_workspace_id: workspaceId, p_lease_token: leaseToken }, writeHeaders);
    } catch (_) {}
  }
}

// Computes the sha256 hex of a snapshot string (used by the IPC layer in main).
function computeSnapshotHash(snapshotStr) {
  return crypto.createHash('sha256').update(snapshotStr, 'utf8').digest('hex');
}

// ── 1G.4B: snapshot pull PREFLIGHT (download + validate; NO apply) ─────────────
// Internal main-side metadata fetch. get_latest_snapshot_metadata returns
// storage_path + snapshot_hash (the renderer-facing cloud-workspace variant
// strips them). This raw result MUST stay in main — never returned to renderer.
async function _callSnapshotMetaRpc(workspaceId, headers) {
  var res, body;
  try {
    res = await _doFetch(getSupabaseUrl() + '/rest/v1/rpc/get_latest_snapshot_metadata', {
      method:  'POST',
      headers: headers,
      body:    JSON.stringify({ p_workspace_id: workspaceId.trim() }),
    });
    var raw = await res.text();
    body = raw && raw.trim() ? JSON.parse(raw) : null;
  } catch (_) {
    return { ok: false, error: 'network_error' };
  }
  if (!res.ok || !body || body.ok !== true) {
    var ec = (body && typeof body.error === 'string') ? body.error : '';
    if (ec === 'not_member')        return { ok: false, error: 'workspace_not_found' };
    if (ec === 'not_authenticated') return { ok: false, error: 'not_authenticated' };
    return { ok: false, error: 'preflight_failed' };
  }
  var snap = body.snapshot || null;
  if (!snap) return { ok: false, error: 'no_snapshot' };
  return {
    ok:          true,
    revision:    typeof snap.revision     === 'number' ? snap.revision     : null,
    storagePath: typeof snap.storage_path === 'string' ? snap.storage_path : null,
    snapshotHash:typeof snap.snapshot_hash=== 'string' ? snap.snapshot_hash: null,
    byteSize:    typeof snap.byte_size    === 'number' ? snap.byte_size    : null,
    createdAt:   typeof snap.created_at   === 'string' ? snap.created_at   : null,
  };
}

// Plausibility check: a sync snapshot is JSON.stringify(DATA) — a non-array
// object that carries at least one expected business-data key.
function _looksLikeData(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
  return ('buildings' in parsed) || ('tenants' in parsed) ||
         ('payments' in parsed)  || ('expenses' in parsed) || ('settings' in parsed);
}

// preflightPullSnapshot — downloads the latest snapshot for the workspace IN
// MEMORY, validates it, then DISCARDS the content. Returns ONLY safe metadata.
// NEVER applies, NEVER writes DATA, NEVER returns content/storage_path/hash/URL.
// input: { workspaceId, baseRevision }
async function preflightPullSnapshot(input) {
  var r = await _downloadAndValidateSnapshot(input);
  if (!r.ok) return r;
  // 1G.4B: content validated — DISCARD it. Safe metadata only.
  return { ok: true, revision: r.revision, byteSize: r.byteSize, createdAt: r.createdAt };
}

// pullSnapshotForApply (1G.4C) — same download + validation as preflight, but
// RETURNS the validated content for the narrow accepted-apply path. The caller
// (main.js cloud:applyPulledSnapshot) creates a mandatory safety backup before
// forwarding the content to the renderer for the localStorage write. The content
// MUST NOT be logged and is the only place a snapshot body leaves this module.
async function pullSnapshotForApply(input) {
  return _downloadAndValidateSnapshot(input);
}

// Shared: download the latest snapshot IN MEMORY and fully validate it. Returns
// { ok, revision, byteSize, createdAt, content } on success (content included),
// or { ok:false, error } with a typed reason. storage_path/snapshot_hash stay here.
async function _downloadAndValidateSnapshot(input) {
  input = input || {};
  if (!isConfigured()) return { ok: false, error: 'not_configured' };

  var workspaceId = typeof input.workspaceId === 'string' ? input.workspaceId.trim() : '';
  if (!_validateWorkspaceId(workspaceId)) return { ok: false, error: 'invalid_input' };
  if (!_isNonNegInt(input.baseRevision))  return { ok: false, error: 'invalid_base_revision' };

  var meta = _auth().getSessionMeta();
  if (!meta || !meta.ok) return { ok: false, error: 'not_authenticated' };

  var headers = await _buildAuthHeaders(true);
  if (!headers) return { ok: false, error: 'not_authenticated' };

  // Step 1 — latest snapshot metadata (main-only: storage_path + hash).
  var m = await _callSnapshotMetaRpc(workspaceId, headers);
  if (!m.ok) return { ok: false, error: m.error };
  if (m.revision === null || m.byteSize === null || !m.storagePath || !m.snapshotHash) {
    return { ok: false, error: 'preflight_failed' };
  }
  // Must be strictly newer than the local base; otherwise nothing to pull.
  if (m.revision <= input.baseRevision) return { ok: false, error: 'not_newer' };
  if (m.byteSize <= 0 || m.byteSize > MAX_SNAPSHOT_BYTES) return { ok: false, error: 'invalid_byte_size' };

  // Step 2 — download content IN MEMORY (authenticated storage GET).
  var dlHeaders = await _buildAuthHeaders(false);
  if (!dlHeaders) return { ok: false, error: 'not_authenticated' };
  var dlRes, content;
  try {
    dlRes = await _doFetch(
      getSupabaseUrl() + '/storage/v1/object/authenticated/' + SNAPSHOT_BUCKET + '/' + m.storagePath,
      { method: 'GET', headers: dlHeaders }
    );
    content = await dlRes.text();
  } catch (_) {
    return { ok: false, error: 'download_failed' };
  }
  if (!dlRes.ok || !content) return { ok: false, error: 'download_failed' };

  // Step 3 — validate: size, integrity hash, JSON parse, plausible DATA shape.
  var actualBytes = Buffer.byteLength(content, 'utf8');
  if (actualBytes !== m.byteSize) return { ok: false, error: 'size_mismatch' };
  if (computeSnapshotHash(content) !== m.snapshotHash) return { ok: false, error: 'hash_mismatch' };
  var parsed;
  try { parsed = JSON.parse(content); } catch (_) { return { ok: false, error: 'invalid_json' }; }
  if (!_looksLikeData(parsed)) return { ok: false, error: 'invalid_shape' };
  parsed = null;

  return {
    ok:        true,
    revision:  m.revision,
    byteSize:  m.byteSize,
    createdAt: m.createdAt || null,
    content:   content,   // validated; caller is responsible for safe handling
  };
}

module.exports = {
  pushWorkspaceSnapshot,
  preflightPullSnapshot,
  pullSnapshotForApply,
  computeSnapshotHash,
  // Constants exported for tests/wiring
  PUSH_ROLES,
  MAX_SNAPSHOT_BYTES,
  SNAPSHOT_BUCKET,
  // Test seams
  _setAuth,
  _setWorkspace,
  _setFetch,
  _resetForTests,
  _snapshotPath,
  _validateWorkspaceId,
  _looksLikeData,
};
