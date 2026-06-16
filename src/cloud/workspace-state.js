'use strict';

// Renderer-side workspace state manager.
// Sits between UI and window.cloudWorkspace bridge.
// Only activeWorkspaceId is persisted — all other state is in-memory only.

var STORAGE_KEY = 'ktp_active_workspace_id';

// ── In-memory state ───────────────────────────────────────────────────────────

var _state = {
  activeWorkspaceId:   null,
  activeWorkspaceName: null,
  memberRole:          null,
  workspaces:          [],
  loading:             false,
  lastError:           null,
};

// ── Test seams ────────────────────────────────────────────────────────────────

var _bridgeImpl  = null;
var _storageImpl = null;

function _setBridge(b)  { _bridgeImpl  = b  || null; }
function _setStorage(s) { _storageImpl = s  || null; }

function _resetForTests() {
  _bridgeImpl  = null;
  _storageImpl = null;
  _state.activeWorkspaceId   = null;
  _state.activeWorkspaceName = null;
  _state.memberRole          = null;
  _state.workspaces          = [];
  _state.loading             = false;
  _state.lastError           = null;
}

function _bridge() {
  if (_bridgeImpl) return _bridgeImpl;
  if (typeof window !== 'undefined' && window.cloudWorkspace) return window.cloudWorkspace;
  throw new Error('cloudWorkspace bridge not available');
}

function _storage() {
  if (_storageImpl) return _storageImpl;
  if (typeof localStorage !== 'undefined') return localStorage;
  throw new Error('localStorage not available');
}

// ── Persistence ───────────────────────────────────────────────────────────────

function _loadActiveWorkspaceId() {
  try { return _storage().getItem(STORAGE_KEY) || null; } catch (_) { return null; }
}

function _saveActiveWorkspaceId(id) {
  try {
    if (id) _storage().setItem(STORAGE_KEY, id);
    else    _storage().removeItem(STORAGE_KEY);
  } catch (_) {}
}

function _clearActiveWorkspaceId() {
  try { _storage().removeItem(STORAGE_KEY); } catch (_) {}
}

// ── Error normalization ───────────────────────────────────────────────────────

var _KNOWN_ERRORS = [
  'not_authenticated', 'network_error', 'workspace_not_found',
  'workspace_conflict', 'unknown_error',
];

function _normalizeError(err) {
  if (typeof err === 'string' && _KNOWN_ERRORS.indexOf(err) !== -1) return err;
  return 'unknown_error';
}

// ── Public API ────────────────────────────────────────────────────────────────

function getState() {
  return {
    activeWorkspaceId:   _state.activeWorkspaceId,
    activeWorkspaceName: _state.activeWorkspaceName,
    memberRole:          _state.memberRole,
    workspaces:          _state.workspaces.slice(),
    loading:             _state.loading,
    lastError:           _state.lastError,
  };
}

function reset() {
  _state.activeWorkspaceId   = null;
  _state.activeWorkspaceName = null;
  _state.memberRole          = null;
  _state.workspaces          = [];
  _state.loading             = false;
  _state.lastError           = null;
  _clearActiveWorkspaceId();
}

async function loadWorkspaces() {
  _state.loading   = true;
  _state.lastError = null;
  var result;
  try {
    result = await _bridge().listWorkspaces();
  } catch (_) {
    _state.loading   = false;
    _state.lastError = 'unknown_error';
    return { ok: false, error: 'unknown_error' };
  }
  if (!result.ok) {
    _state.loading   = false;
    _state.lastError = _normalizeError(result.error);
    return { ok: false, error: _state.lastError };
  }
  _state.workspaces = Array.isArray(result.workspaces) ? result.workspaces : [];
  _state.loading    = false;
  return { ok: true, workspaces: _state.workspaces.slice() };
}

async function createWorkspace(payload) {
  _state.loading   = true;
  _state.lastError = null;
  var result;
  try {
    result = await _bridge().createWorkspace(payload);
  } catch (_) {
    _state.loading   = false;
    _state.lastError = 'unknown_error';
    return { ok: false, error: 'unknown_error' };
  }
  if (!result.ok) {
    _state.loading   = false;
    _state.lastError = _normalizeError(result.error);
    return { ok: false, error: _state.lastError };
  }
  // Refresh workspace list silently after creation.
  try {
    var listResult = await _bridge().listWorkspaces();
    if (listResult.ok) {
      _state.workspaces = Array.isArray(listResult.workspaces) ? listResult.workspaces : [];
    }
  } catch (_) {}
  _state.loading = false;
  return {
    ok:            true,
    workspaceId:   result.workspaceId,
    workspaceName: result.workspaceName,
  };
}

async function activateWorkspace(opts) {
  _state.loading   = true;
  _state.lastError = null;
  var result;
  try {
    result = await _bridge().activateWorkspace(opts);
  } catch (_) {
    _state.loading   = false;
    _state.lastError = 'unknown_error';
    return { ok: false, error: 'unknown_error' };
  }
  if (!result.ok) {
    _state.loading   = false;
    _state.lastError = _normalizeError(result.error);
    return { ok: false, error: _state.lastError };
  }
  _state.activeWorkspaceId   = result.workspaceId;
  _state.activeWorkspaceName = result.workspaceName;
  _state.memberRole          = result.memberRole;
  _saveActiveWorkspaceId(result.workspaceId);
  _state.loading = false;
  return {
    ok:            true,
    workspaceId:   result.workspaceId,
    workspaceName: result.workspaceName,
    memberRole:    result.memberRole,
  };
}

// Called on app startup: restores persisted activeWorkspaceId and validates it
// against the current workspace list from the bridge.
async function restore() {
  var savedId = _loadActiveWorkspaceId();
  if (!savedId) return { ok: true, restored: false };

  var listResult = await loadWorkspaces();
  if (!listResult.ok) {
    _state.activeWorkspaceId = savedId;
    return { ok: false, error: listResult.error };
  }

  var found = _state.workspaces.find(function(w) { return w.workspaceId === savedId; });
  if (!found) {
    // Saved workspace no longer accessible — clear state and storage.
    _state.activeWorkspaceId   = null;
    _state.activeWorkspaceName = null;
    _state.memberRole          = null;
    _clearActiveWorkspaceId();
    return { ok: true, restored: false, reason: 'workspace_not_found' };
  }

  _state.activeWorkspaceId   = found.workspaceId;
  _state.activeWorkspaceName = found.workspaceName || null;
  _state.memberRole          = found.memberRole    || null;
  return {
    ok:            true,
    restored:      true,
    workspaceId:   found.workspaceId,
    workspaceName: found.workspaceName,
  };
}

module.exports = {
  getState,
  reset,
  loadWorkspaces,
  createWorkspace,
  activateWorkspace,
  restore,
  _setBridge,
  _setStorage,
  _resetForTests,
  _normalizeError,
};
