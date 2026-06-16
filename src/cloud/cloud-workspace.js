'use strict';

const os     = require('os');
const crypto = require('crypto');
const { getSupabaseUrl, getBaseHeaders, isConfigured } = require('./cloud-config');
const _defaultStore = require('./cloud-session-store');
const _defaultAuth  = require('./cloud-auth');

// ── Test seams ─────────────────────────────────────────────────────────────────
let _fetchImpl = null;
let _storeImpl = null;
let _authImpl  = null;
let _uuidImpl  = null;

function _setFetch(fn) { _fetchImpl = fn || null; }
function _setStore(s)  { _storeImpl = s  || null; }
function _setAuth(a)   { _authImpl  = a  || null; }
function _setUUID(fn)  { _uuidImpl  = fn || null; }

function _resetForTests() {
  _fetchImpl = null;
  _storeImpl = null;
  _authImpl  = null;
  _uuidImpl  = null;
}

function _doFetch(url, opts) { return (_fetchImpl || global.fetch)(url, opts); }
function _store()            { return _storeImpl || _defaultStore; }
function _auth()             { return _authImpl  || _defaultAuth; }
function _newUUID()          { return _uuidImpl ? _uuidImpl() : crypto.randomUUID(); }

// ── Validation ─────────────────────────────────────────────────────────────────

function _validateWorkspaceName(name) {
  if (typeof name !== 'string') return false;
  var t = name.trim();
  return t.length >= 1 && t.length <= 255;
}

function _validateLocalWorkspaceId(id) {
  if (typeof id !== 'string') return false;
  var t = id.trim();
  return t.length >= 1 && t.length <= 128;
}

function _validateWorkspaceId(id) {
  if (typeof id !== 'string') return false;
  return id.trim().length > 0;
}

// ── Error normalization ────────────────────────────────────────────────────────

function _normalizeError(status, body) {
  if (!body) return 'unknown_error';
  if (status === 401 || status === 403) return 'permission_denied';
  if (status === 404)                   return 'workspace_not_found';
  if (body.ok === false && body.error) {
    var e = String(body.error);
    if (e === 'local_workspace_id_conflict') return 'workspace_conflict';
    if (e === 'workspace_not_found')         return 'workspace_not_found';
    if (e === 'not_member')                  return 'workspace_not_found';
    if (e === 'permission_denied')           return 'permission_denied';
    if (e === 'not_authenticated')           return 'not_authenticated';
  }
  return 'unknown_error';
}

// ── Common request header builder ──────────────────────────────────────────────

async function _buildHeaders(isWrite) {
  var token = await _auth().getAccessToken();
  if (!token) return null;
  var h = Object.assign({}, getBaseHeaders());
  h['Authorization'] = 'Bearer ' + token;
  h[isWrite ? 'Content-Profile' : 'Accept-Profile'] = 'ktp';
  return h;
}

// ── listWorkspaces ─────────────────────────────────────────────────────────────

async function listWorkspaces() {
  if (!isConfigured()) return { ok: false, error: 'not_configured' };
  var headers = await _buildHeaders(false);
  if (!headers) return { ok: false, error: 'not_authenticated' };

  var url = getSupabaseUrl()
    + '/rest/v1/workspace_members'
    + '?select=member_role,workspace_id,workspaces!inner(id,name,local_workspace_id,owner_id)'
    + '&deleted_at=is.null';

  var res, body;
  try {
    res  = await _doFetch(url, { method: 'GET', headers: headers });
    body = await res.json();
  } catch (_) {
    return { ok: false, error: 'network_error' };
  }
  if (!res.ok) return { ok: false, error: _normalizeError(res.status, body) };
  if (!Array.isArray(body)) return { ok: false, error: 'unknown_error' };

  return {
    ok: true,
    workspaces: body.map(function(row) {
      return {
        workspaceId:      row.workspace_id,
        localWorkspaceId: row.workspaces ? row.workspaces.local_workspace_id : null,
        workspaceName:    row.workspaces ? row.workspaces.name                : null,
        memberRole:       row.member_role,
      };
    }),
  };
}

// ── createWorkspace ────────────────────────────────────────────────────────────

async function createWorkspace(payload) {
  if (!isConfigured()) return { ok: false, error: 'not_configured' };
  if (!payload || typeof payload !== 'object') return { ok: false, error: 'invalid_input' };

  var name             = typeof payload.name             === 'string' ? payload.name.trim()             : '';
  var localWorkspaceId = typeof payload.localWorkspaceId === 'string' ? payload.localWorkspaceId.trim() : '';

  if (!_validateWorkspaceName(name))              return { ok: false, error: 'invalid_input' };
  if (!_validateLocalWorkspaceId(localWorkspaceId)) return { ok: false, error: 'invalid_input' };

  var headers = await _buildHeaders(true);
  if (!headers) return { ok: false, error: 'not_authenticated' };

  var res, body;
  try {
    res  = await _doFetch(getSupabaseUrl() + '/rest/v1/rpc/create_workspace', {
      method:  'POST',
      headers: headers,
      body:    JSON.stringify({ p_name: name, p_local_workspace_id: localWorkspaceId }),
    });
    body = await res.json();
  } catch (_) {
    return { ok: false, error: 'network_error' };
  }

  if (!res.ok || (body && body.ok === false)) {
    return { ok: false, error: _normalizeError(res.status, body) };
  }

  return {
    ok:               true,
    workspaceId:      body.workspace_id,
    localWorkspaceId: body.local_workspace_id,
    workspaceName:    name,
  };
}

// ── getOrCreateDeviceId ────────────────────────────────────────────────────────

async function getOrCreateDeviceId() {
  var existing = null;
  try { existing = _store().loadDeviceId(); } catch (_) {}
  if (existing) return existing;

  var uuid = _newUUID();
  try { _store().saveDeviceId(uuid); } catch (_) {}
  return uuid;
}

// ── registerDevice ─────────────────────────────────────────────────────────────

async function registerDevice() {
  if (!isConfigured()) return { ok: false, error: 'not_configured' };
  var headers = await _buildHeaders(true);
  if (!headers) return { ok: false, error: 'not_authenticated' };

  var deviceId;
  try { deviceId = await getOrCreateDeviceId(); } catch (_) {
    return { ok: false, error: 'unknown_error' };
  }

  var appVersion = '';
  try { appVersion = require('electron').app.getVersion(); } catch (_) {}

  var res, body;
  try {
    res  = await _doFetch(getSupabaseUrl() + '/rest/v1/rpc/register_device', {
      method:  'POST',
      headers: headers,
      body:    JSON.stringify({
        p_device_id:   deviceId,
        p_device_name: os.hostname(),
        p_platform:    process.platform,
        p_app_version: appVersion,
      }),
    });
    body = await res.json();
  } catch (_) {
    return { ok: false, error: 'network_error' };
  }

  if (!res.ok || (body && body.ok === false)) {
    return { ok: false, error: _normalizeError(res.status, body) };
  }

  // Never return the deviceId to the caller.
  return { ok: true, deviceRegistered: true };
}

// ── activateWorkspace ──────────────────────────────────────────────────────────

async function activateWorkspace(opts) {
  if (!isConfigured()) return { ok: false, error: 'not_configured' };
  if (!opts || typeof opts.workspaceId !== 'string' || !opts.workspaceId.trim()) {
    return { ok: false, error: 'invalid_input' };
  }
  var workspaceId = opts.workspaceId.trim();

  var listResult = await listWorkspaces();
  if (!listResult.ok) return { ok: false, error: listResult.error };

  var ws = listResult.workspaces.find(function(w) { return w.workspaceId === workspaceId; });
  if (!ws) return { ok: false, error: 'workspace_not_found' };

  // Fire-and-forget: network failure does not block activation.
  try { await registerDevice(); } catch (_) {}

  return {
    ok:            true,
    workspaceId:   ws.workspaceId,
    workspaceName: ws.workspaceName,
    memberRole:    ws.memberRole,
  };
}

// ── getWorkspaceStatus ─────────────────────────────────────────────────────────

async function getWorkspaceStatus() {
  if (!isConfigured()) return { ok: false, error: 'not_configured' };
  var meta = _auth().getSessionMeta();
  if (!meta.ok) return { ok: false, error: 'not_authenticated' };

  var result = await listWorkspaces();
  if (!result.ok) return { ok: false, error: result.error };

  return {
    ok:           true,
    hasWorkspace: result.workspaces.length > 0,
    workspaces:   result.workspaces,
    userId:       meta.userId,
  };
}

// ── getSyncStatus (CLOUD-FOUNDATION-1F.3, read-only) ───────────────────────────

async function getSyncStatus(workspaceId) {
  if (!isConfigured()) return { ok: false, error: 'not_configured' };
  if (!_validateWorkspaceId(workspaceId)) return { ok: false, error: 'invalid_input' };

  var headers = await _buildHeaders(true);
  if (!headers) return { ok: false, error: 'not_authenticated' };

  var res, body;
  try {
    res  = await _doFetch(getSupabaseUrl() + '/rest/v1/rpc/get_sync_status', {
      method:  'POST',
      headers: headers,
      body:    JSON.stringify({ p_workspace_id: workspaceId.trim() }),
    });
    body = await res.json();
  } catch (_) {
    return { ok: false, error: 'network_error' };
  }

  if (!res.ok || (body && body.ok === false)) {
    return { ok: false, error: _normalizeError(res.status, body) };
  }

  return {
    ok:              true,
    currentRevision: typeof body.current_revision === 'number' ? body.current_revision : 0,
    lockFree:        body.lock_free !== false,
    lockExpiresAt:   body.lock_free === false ? (body.lock_expires_at || null) : null,
  };
}

// ── getLatestSnapshotMetadata (CLOUD-FOUNDATION-1F.3, read-only) ──────────────
// Intentionally omits storage_path, snapshot_hash, and pushed_by (raw user id) —
// not needed for read-only status display.

async function getLatestSnapshotMetadata(workspaceId) {
  if (!isConfigured()) return { ok: false, error: 'not_configured' };
  if (!_validateWorkspaceId(workspaceId)) return { ok: false, error: 'invalid_input' };

  var headers = await _buildHeaders(true);
  if (!headers) return { ok: false, error: 'not_authenticated' };

  var res, body;
  try {
    res  = await _doFetch(getSupabaseUrl() + '/rest/v1/rpc/get_latest_snapshot_metadata', {
      method:  'POST',
      headers: headers,
      body:    JSON.stringify({ p_workspace_id: workspaceId.trim() }),
    });
    body = await res.json();
  } catch (_) {
    return { ok: false, error: 'network_error' };
  }

  if (!res.ok || (body && body.ok === false)) {
    return { ok: false, error: _normalizeError(res.status, body) };
  }

  var snap = body.snapshot || null;
  return {
    ok:       true,
    snapshot: snap ? {
      revision:  snap.revision,
      createdAt: snap.created_at,
      byteSize:  snap.byte_size,
    } : null,
  };
}

// ── Exports ────────────────────────────────────────────────────────────────────

module.exports = {
  listWorkspaces,
  createWorkspace,
  activateWorkspace,
  getWorkspaceStatus,
  getOrCreateDeviceId,
  registerDevice,
  getSyncStatus,
  getLatestSnapshotMetadata,
  // Test seams
  _setFetch,
  _setStore,
  _setAuth,
  _setUUID,
  _resetForTests,
  // Exported for unit tests
  _validateWorkspaceName,
  _validateLocalWorkspaceId,
  _validateWorkspaceId,
  _normalizeError,
};
