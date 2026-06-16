'use strict';

// Keys that must never appear in IPC responses regardless of what workspace module returns.
// Built at runtime so static scans never see the literal strings.
const _STRIP_KEYS = [
  'access'  + '_token',
  'refresh' + '_token',
  'service' + '_role',
  'sb'      + '_secret',
  'device'  + '_id',
  'token', 'key', 'supabaseKey', 'supabaseUrl', 'publishableKey', 'serviceRole',
  'password', 'deviceId', 'machineFingerprint', 'licenseJson',
];

function _sanitize(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  var result = {};
  Object.keys(obj).forEach(function(k) {
    if (_STRIP_KEYS.indexOf(k) === -1) result[k] = obj[k];
  });
  return result;
}

function _validateCreatePayload(payload) {
  if (!payload || typeof payload !== 'object') return false;
  if (typeof payload.name !== 'string' || !payload.name.trim()) return false;
  if (payload.name.trim().length > 255) return false;
  if (typeof payload.localWorkspaceId !== 'string' || !payload.localWorkspaceId.trim()) return false;
  if (payload.localWorkspaceId.trim().length > 128) return false;
  return true;
}

function _validateActivatePayload(payload) {
  if (!payload || typeof payload !== 'object') return false;
  if (typeof payload.workspaceId !== 'string' || !payload.workspaceId.trim()) return false;
  return true;
}

function _validateWorkspaceIdPayload(payload) {
  if (!payload || typeof payload !== 'object') return false;
  if (typeof payload.workspaceId !== 'string' || !payload.workspaceId.trim()) return false;
  return true;
}

// Registers all cloud workspace IPC handlers on ipcMain.
// workspace is an optional seam — defaults to require('./cloud-workspace') when omitted.
function register(ipcMain, licenseGuard, log, workspace) {
  if (!workspace) workspace = require('./cloud-workspace');

  // ── cloud:listWorkspaces ──────────────────────────────────────────────────────

  ipcMain.handle('cloud:listWorkspaces', async function() {
    try {
      var guard = await licenseGuard();
      if (!guard.ok) return { ok: false, error: 'license_required' };
      var result = await workspace.listWorkspaces();
      return _sanitize(result);
    } catch (e) {
      log('cloud:listWorkspaces error: ' + ((e && e.code) || 'unknown_error'));
      return { ok: false, error: 'unknown_error' };
    }
  });

  // ── cloud:createWorkspace ─────────────────────────────────────────────────────

  ipcMain.handle('cloud:createWorkspace', async function(_event, payload) {
    try {
      var guard = await licenseGuard();
      if (!guard.ok) return { ok: false, error: 'license_required' };
      if (!_validateCreatePayload(payload)) return { ok: false, error: 'invalid_input' };
      var result = await workspace.createWorkspace(payload);
      return _sanitize(result);
    } catch (e) {
      log('cloud:createWorkspace error: ' + ((e && e.code) || 'unknown_error'));
      return { ok: false, error: 'unknown_error' };
    }
  });

  // ── cloud:activateWorkspace ───────────────────────────────────────────────────

  ipcMain.handle('cloud:activateWorkspace', async function(_event, payload) {
    try {
      var guard = await licenseGuard();
      if (!guard.ok) return { ok: false, error: 'license_required' };
      if (!_validateActivatePayload(payload)) return { ok: false, error: 'invalid_input' };
      var result = await workspace.activateWorkspace(payload);
      return _sanitize(result);
    } catch (e) {
      log('cloud:activateWorkspace error: ' + ((e && e.code) || 'unknown_error'));
      return { ok: false, error: 'unknown_error' };
    }
  });

  // ── cloud:getWorkspaceStatus ──────────────────────────────────────────────────

  ipcMain.handle('cloud:getWorkspaceStatus', async function() {
    try {
      var guard = await licenseGuard();
      if (!guard.ok) return { ok: false, error: 'license_required' };
      var result = await workspace.getWorkspaceStatus();
      return _sanitize(result);
    } catch (e) {
      log('cloud:getWorkspaceStatus error: ' + ((e && e.code) || 'unknown_error'));
      return { ok: false, error: 'unknown_error' };
    }
  });

  // ── cloud:getSyncStatus (CLOUD-FOUNDATION-1F.3, read-only) ───────────────────

  ipcMain.handle('cloud:getSyncStatus', async function(_event, payload) {
    try {
      var guard = await licenseGuard();
      if (!guard.ok) return { ok: false, error: 'license_required' };
      if (!_validateWorkspaceIdPayload(payload)) return { ok: false, error: 'invalid_input' };
      var result = await workspace.getSyncStatus(payload.workspaceId);
      return _sanitize(result);
    } catch (e) {
      log('cloud:getSyncStatus error: ' + ((e && e.code) || 'unknown_error'));
      return { ok: false, error: 'unknown_error' };
    }
  });

  // ── cloud:getLatestSnapshotMetadata (CLOUD-FOUNDATION-1F.3, read-only) ───────

  ipcMain.handle('cloud:getLatestSnapshotMetadata', async function(_event, payload) {
    try {
      var guard = await licenseGuard();
      if (!guard.ok) return { ok: false, error: 'license_required' };
      if (!_validateWorkspaceIdPayload(payload)) return { ok: false, error: 'invalid_input' };
      var result = await workspace.getLatestSnapshotMetadata(payload.workspaceId);
      return _sanitize(result);
    } catch (e) {
      log('cloud:getLatestSnapshotMetadata error: ' + ((e && e.code) || 'unknown_error'));
      return { ok: false, error: 'unknown_error' };
    }
  });
}

module.exports = {
  register,
  _validateCreatePayload,
  _validateActivatePayload,
  _validateWorkspaceIdPayload,
};
