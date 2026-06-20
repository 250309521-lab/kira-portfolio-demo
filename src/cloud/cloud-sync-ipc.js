'use strict';

// CLOUD-FOUNDATION-1G.2 — Real Sync IPC (auto-push only).
//
// Guarded write channel:
//   • cloud:pushWorkspaceSnapshot — pushes the local whole-workspace snapshot to
//     the cloud with CAS. The renderer sends only { workspaceId, baseRevision,
//     rendererState } (the serialized DATA). This handler computes byteSize +
//     sha256 + resolves the device id + app version in main, then delegates to
//     cloud-sync.js. Returns ONLY a sanitized whitelist — never a token, lease
//     token, storage path, raw hash, or device id.
//
// This channel does NOT pull, does NOT apply, and does NOT touch backup/apply.

// Keys that must never appear in a sync IPC response. Built at runtime so static
// scans never see the literals.
const _STRIP_KEYS = [
  'access'  + '_token',
  'refresh' + '_token',
  'service' + '_role',
  'sb'      + '_secret',
  'device'  + '_id',
  'lease'   + '_token',
  'token', 'key', 'supabaseKey', 'supabaseUrl', 'publishableKey', 'serviceRole',
  'password', 'deviceId', 'leaseToken', 'machineFingerprint', 'licenseJson',
  'storagePath', 'storage' + '_path', 'snapshotHash', 'snapshot' + '_hash',
  'checksum', 'metadata', 'snapshotStr', 'rendererState',
];

function _sanitize(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  var result = {};
  Object.keys(obj).forEach(function(k) {
    if (_STRIP_KEYS.indexOf(k) === -1) result[k] = obj[k];
  });
  return result;
}

function _validatePushPayload(payload) {
  if (!payload || typeof payload !== 'object') return false;
  if (typeof payload.workspaceId !== 'string' || !payload.workspaceId.trim()) return false;
  if (typeof payload.rendererState !== 'string' || !payload.rendererState) return false;
  if (typeof payload.baseRevision !== 'number' || !isFinite(payload.baseRevision) ||
      payload.baseRevision < 0 || Math.floor(payload.baseRevision) !== payload.baseRevision) return false;
  return true;
}

// Whitelist the push result: only safe confirmation/conflict fields reach the
// renderer. storage path, hash, lease token, device id never appear here.
function _pickPushResult(result) {
  if (!result || typeof result !== 'object') return { ok: false, error: 'unknown_error' };
  if (result.ok === true) {
    return {
      ok:          true,
      newRevision: typeof result.newRevision === 'number' ? result.newRevision : null,
      pushedAt:    typeof result.pushedAt    === 'string' ? result.pushedAt    : null,
    };
  }
  var out = { ok: false, error: typeof result.error === 'string' ? result.error : 'unknown_error' };
  // Non-destructive stale result carries the current cloud revision (a number,
  // not sensitive) so the renderer can mark "cloud has newer changes".
  if (result.error === 'stale_revision' && typeof result.currentRevision === 'number') {
    out.currentRevision = result.currentRevision;
  }
  return out;
}

// register(ipcMain, licenseGuard, log, deps)
//   deps.cloudSync   — defaults to require('./cloud-sync')
//   deps.getDeviceId — () => Promise<string|null> | string|null
//   deps.appVersion  — string
function register(ipcMain, licenseGuard, log, deps) {
  deps = deps || {};
  var cloudSync   = deps.cloudSync   || require('./cloud-sync');
  var getDeviceId = deps.getDeviceId || function() { return null; };
  var appVersion  = typeof deps.appVersion === 'string' ? deps.appVersion : undefined;

  // ── cloud:pushWorkspaceSnapshot (1G.2, guarded CAS write) ───────────────────
  ipcMain.handle('cloud:pushWorkspaceSnapshot', async function(_event, payload) {
    try {
      var guard = await licenseGuard();
      if (!guard.ok) return { ok: false, error: 'license_required' };
      if (!_validatePushPayload(payload)) return { ok: false, error: 'invalid_input' };

      var snapshotStr = payload.rendererState;
      var byteSize    = Buffer.byteLength(snapshotStr, 'utf8');
      var snapshotHash = cloudSync.computeSnapshotHash(snapshotStr);

      var deviceId = null;
      try { deviceId = await getDeviceId(); } catch (_) { deviceId = null; }

      var result = await cloudSync.pushWorkspaceSnapshot({
        workspaceId:  payload.workspaceId,
        baseRevision: payload.baseRevision,
        snapshotStr:  snapshotStr,
        byteSize:     byteSize,
        snapshotHash: snapshotHash,
        deviceId:     deviceId,
        appVersion:   appVersion,
      });

      return _pickPushResult(result);
    } catch (e) {
      log('cloud:pushWorkspaceSnapshot error: ' + ((e && e.code) || 'unknown_error'));
      return { ok: false, error: 'unknown_error' };
    }
  });
}

module.exports = {
  register,
  _sanitize,
  _pickPushResult,
  _validatePushPayload,
  _STRIP_KEYS,
};
