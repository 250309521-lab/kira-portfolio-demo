'use strict';

// CLOUD-FOUNDATION-1F.4A — Cloud Backup readiness/preflight IPC (READ-ONLY).
//
// Exposes two sanitized, read-only channels:
//   • cloud:getCloudBackupReadiness   — resolves role / canBackup / limits
//   • cloud:buildCloudBackupPreflight — builds a backup IN MEMORY (no disk, no
//                                       upload), validates size/checksum/shape
//
// Neither channel uploads a file, writes cloud_backups, writes audit_logs, or
// mutates any storage object or table.

// Keys that must never appear in IPC responses regardless of what the backup
// module returns. Built at runtime so static scans never see the literals.
const _STRIP_KEYS = [
  'access'  + '_token',
  'refresh' + '_token',
  'service' + '_role',
  'sb'      + '_secret',
  'device'  + '_id',
  'token', 'key', 'supabaseKey', 'supabaseUrl', 'publishableKey', 'serviceRole',
  'password', 'deviceId', 'machineFingerprint', 'licenseJson',
  'storagePath', 'storage' + '_path', 'metadata', 'checksum',
];

function _sanitize(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  var result = {};
  Object.keys(obj).forEach(function(k) {
    if (_STRIP_KEYS.indexOf(k) === -1) result[k] = obj[k];
  });
  return result;
}

// Whitelist the preflight response: only non-sensitive readiness fields reach
// the renderer. storagePath, raw checksum, and the metadata shape stay in main.
function _pickPreflight(result, lastLocalBackupAt) {
  if (!result || result.ok !== true) return _sanitize(result);
  return {
    ok:               true,
    withinLimit:      result.withinLimit === true,
    byteSize:         typeof result.byteSize === 'number' ? result.byteSize : null,
    maxBytes:         typeof result.maxBytes === 'number' ? result.maxBytes : null,
    checksumValid:    result.checksumValid === true,
    metadataValid:    result.metadataValid === true,
    lastLocalBackupAt: lastLocalBackupAt || null,
  };
}

function _validateWorkspaceIdPayload(payload) {
  if (!payload || typeof payload !== 'object') return false;
  if (typeof payload.workspaceId !== 'string' || !payload.workspaceId.trim()) return false;
  return true;
}

// register(ipcMain, licenseGuard, log, deps)
//   deps.cloudBackup           — defaults to require('./cloud-backup')
//   deps.buildPreflightArchive — (rendererState, importProfiles) => { byteSize, checksum }
//                                builds the archive IN MEMORY (no disk write)
//   deps.getLastLocalBackupAt  — () => ISO string | null
function register(ipcMain, licenseGuard, log, deps) {
  deps = deps || {};
  var cloudBackup = deps.cloudBackup || require('./cloud-backup');
  var buildPreflightArchive = deps.buildPreflightArchive;
  var getLastLocalBackupAt  = deps.getLastLocalBackupAt || function() { return null; };

  // ── cloud:getCloudBackupReadiness ──────────────────────────────────────────
  ipcMain.handle('cloud:getCloudBackupReadiness', async function(_event, payload) {
    try {
      var guard = await licenseGuard();
      if (!guard.ok) return { ok: false, error: 'license_required' };
      if (!_validateWorkspaceIdPayload(payload)) return { ok: false, error: 'invalid_input' };
      var result = await cloudBackup.getCloudBackupReadiness(payload.workspaceId);
      return _sanitize(result);
    } catch (e) {
      log('cloud:getCloudBackupReadiness error: ' + ((e && e.code) || 'unknown_error'));
      return { ok: false, error: 'unknown_error' };
    }
  });

  // ── cloud:buildCloudBackupPreflight ────────────────────────────────────────
  ipcMain.handle('cloud:buildCloudBackupPreflight', async function(_event, payload) {
    try {
      var guard = await licenseGuard();
      if (!guard.ok) return { ok: false, error: 'license_required' };
      if (!_validateWorkspaceIdPayload(payload)) return { ok: false, error: 'invalid_input' };
      if (typeof buildPreflightArchive !== 'function') {
        return { ok: false, error: 'local_backup_unavailable' };
      }

      var built;
      try {
        built = buildPreflightArchive(
          typeof payload.rendererState  === 'string' ? payload.rendererState  : '{}',
          typeof payload.importProfiles === 'string' ? payload.importProfiles : null
        );
      } catch (_) {
        return { ok: false, error: 'local_backup_unavailable' };
      }
      if (!built || typeof built.byteSize !== 'number' || typeof built.checksum !== 'string') {
        return { ok: false, error: 'local_backup_unavailable' };
      }

      var result = cloudBackup.derivePreflightMetadata({
        workspaceId: payload.workspaceId,
        byteSize:    built.byteSize,
        checksum:    built.checksum,
        trigger:     'manual',
        appVersion:  typeof built.appVersion === 'string' ? built.appVersion : undefined,
      });

      if (!result || result.ok !== true) return _sanitize(result);

      var lastLocalBackupAt = null;
      try { lastLocalBackupAt = getLastLocalBackupAt(); } catch (_) {}

      return _pickPreflight(result, lastLocalBackupAt);
    } catch (e) {
      log('cloud:buildCloudBackupPreflight error: ' + ((e && e.code) || 'unknown_error'));
      return { ok: false, error: 'unknown_error' };
    }
  });
}

module.exports = {
  register,
  _sanitize,
  _pickPreflight,
  _validateWorkspaceIdPayload,
  _STRIP_KEYS,
};
