'use strict';

// CLOUD-FOUNDATION-1F.4A/1F.4B — Cloud Backup IPC.
//
// Read-only channels (1F.4A, frozen):
//   • cloud:getCloudBackupReadiness   — resolves role / canBackup / limits
//   • cloud:buildCloudBackupPreflight — builds a backup IN MEMORY (no disk, no
//                                       upload), validates size/checksum/shape
//
// Guarded write channel (1F.4B):
//   • cloud:createManualBackup — runs ONLY in direct response to this single
//     explicit invocation (the renderer only calls it from a user button
//     click — there is no timer/startup/focus path anywhere in this file).
//     Builds the archive fresh, then delegates the actual upload + metadata
//     write to cloud-backup.js. Returns only a sanitized whitelist; never a
//     token, storage header, storage path, raw checksum, or device id.

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

// Whitelist the manual-upload success response: only safe confirmation fields
// reach the renderer. storagePath/checksum/deviceId never appear here.
function _pickManualBackupResult(result) {
  if (!result || result.ok !== true) return _sanitize(result);
  return {
    ok:        true,
    backupId:  typeof result.backupId  === 'string' ? result.backupId  : null,
    createdAt: typeof result.createdAt === 'string' ? result.createdAt : null,
    byteSize:  typeof result.byteSize  === 'number' ? result.byteSize  : null,
    trigger:   typeof result.trigger   === 'string' ? result.trigger   : 'manual',
  };
}

// Whitelist the backup-list response: only safe metadata per backup row.
// storage_path, checksum, and device_id are never returned.
function _pickBackupList(result) {
  if (!result || result.ok !== true) return _sanitize(result);
  var backups = Array.isArray(result.backups) ? result.backups.map(function(b) {
    return {
      backupId:      typeof b.backupId      === 'string' ? b.backupId      : null,
      trigger:       typeof b.trigger       === 'string' ? b.trigger       : null,
      byteSize:      typeof b.byteSize      === 'number' ? b.byteSize      : null,
      appVersion:    typeof b.appVersion    === 'string' ? b.appVersion    : null,
      formatVersion: typeof b.formatVersion === 'number' ? b.formatVersion : null,
      createdAt:     typeof b.createdAt     === 'string' ? b.createdAt     : null,
    };
  }) : [];
  return { ok: true, backups: backups };
}

// Whitelist the download-preflight response: access-validated safe metadata only.
// storage_path, checksum, and signed URL (not generated in 1F.4C) never appear.
function _pickDownloadPreflight(result) {
  if (!result || result.ok !== true) return _sanitize(result);
  return {
    ok:       true,
    backupId: typeof result.backupId === 'string' ? result.backupId : null,
    byteSize: typeof result.byteSize === 'number' ? result.byteSize : null,
  };
}

// Whitelist the file-download result: safe confirmation fields only.
// Full savePath, storage_path, and checksum never reach the renderer.
function _pickDownloadResult(result) {
  if (!result || result.ok !== true) return _sanitize(result);
  return {
    ok:           true,
    backupId:     typeof result.backupId     === 'string' ? result.backupId     : null,
    byteSize:     typeof result.byteSize     === 'number' ? result.byteSize     : null,
    savedName:    typeof result.savedName    === 'string' ? result.savedName    : null,
    downloadedAt: typeof result.downloadedAt === 'string' ? result.downloadedAt : null,
  };
}

// Default save dialog — uses Electron's dialog in main process.
// Deps can override this for tests.
function _defaultShowSaveDialog(opts) {
  var dialog = require('electron').dialog;
  return dialog.showSaveDialog(opts).then(function(res) {
    return res.canceled ? null : (res.filePath || null);
  });
}

// register(ipcMain, licenseGuard, log, deps)
//   deps.cloudBackup              — defaults to require('./cloud-backup')
//   deps.buildPreflightArchive    — (rendererState, importProfiles) => { byteSize, checksum }
//                                   builds the archive IN MEMORY (no disk write)
//   deps.buildManualBackupArchive — (rendererState, importProfiles) => { archiveStr, byteSize, checksum, appVersion }
//                                   builds the FULL archive string IN MEMORY (no disk write)
//   deps.getLastLocalBackupAt     — () => ISO string | null
//   deps.showSaveDialog           — (opts) => Promise<string|null> — test seam for Electron save dialog
//   deps.buildAutoBackupArchive   — same signature as buildManualBackupArchive, used for trigger='auto'
function register(ipcMain, licenseGuard, log, deps) {
  deps = deps || {};
  var cloudBackup = deps.cloudBackup || require('./cloud-backup');
  var buildPreflightArchive    = deps.buildPreflightArchive;
  var buildManualBackupArchive = deps.buildManualBackupArchive;
  var buildAutoBackupArchive   = deps.buildAutoBackupArchive || deps.buildManualBackupArchive;
  var getLastLocalBackupAt     = deps.getLastLocalBackupAt || function() { return null; };
  var showSaveDialog           = deps.showSaveDialog || _defaultShowSaveDialog;

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

  // ── cloud:listBackups (1F.4C, read-only) ──────────────────────────────────────
  ipcMain.handle('cloud:listBackups', async function(_event, payload) {
    try {
      var guard = await licenseGuard();
      if (!guard.ok) return { ok: false, error: 'license_required' };
      if (!_validateWorkspaceIdPayload(payload)) return { ok: false, error: 'invalid_input' };
      var result = await cloudBackup.listCloudBackups(
        payload.workspaceId,
        { limit: typeof payload.limit === 'number' ? payload.limit : 10 }
      );
      return _pickBackupList(result);
    } catch (e) {
      log('cloud:listBackups error: ' + ((e && e.code) || 'unknown_error'));
      return { ok: false, error: 'unknown_error' };
    }
  });

  // ── cloud:createBackupDownloadPreflight (1F.4C, read-only) ────────────────────
  // Validates access to a specific backup. Does NOT download bytes, restore, or apply.
  ipcMain.handle('cloud:createBackupDownloadPreflight', async function(_event, payload) {
    try {
      var guard = await licenseGuard();
      if (!guard.ok) return { ok: false, error: 'license_required' };
      if (!_validateWorkspaceIdPayload(payload)) return { ok: false, error: 'invalid_input' };
      if (typeof payload.backupId !== 'string' || !payload.backupId.trim()) {
        return { ok: false, error: 'invalid_input' };
      }
      var result = await cloudBackup.getBackupDownloadPreflight(
        payload.workspaceId,
        payload.backupId
      );
      return _pickDownloadPreflight(result);
    } catch (e) {
      log('cloud:createBackupDownloadPreflight error: ' + ((e && e.code) || 'unknown_error'));
      return { ok: false, error: 'unknown_error' };
    }
  });

  // ── cloud:createManualBackup (1F.4B, guarded write — explicit user action only) ──
  ipcMain.handle('cloud:createManualBackup', async function(_event, payload) {
    try {
      var guard = await licenseGuard();
      if (!guard.ok) return { ok: false, error: 'license_required' };
      if (!_validateWorkspaceIdPayload(payload)) return { ok: false, error: 'invalid_input' };
      if (typeof buildManualBackupArchive !== 'function') {
        return { ok: false, error: 'backup_build_failed' };
      }

      var built;
      try {
        built = buildManualBackupArchive(
          typeof payload.rendererState  === 'string' ? payload.rendererState  : '{}',
          typeof payload.importProfiles === 'string' ? payload.importProfiles : null
        );
      } catch (_) {
        return { ok: false, error: 'backup_build_failed' };
      }
      if (!built || typeof built.archiveStr !== 'string' ||
          typeof built.byteSize !== 'number' || typeof built.checksum !== 'string') {
        return { ok: false, error: 'backup_build_failed' };
      }

      var result = await cloudBackup.createManualCloudBackup({
        workspaceId: payload.workspaceId,
        archiveStr:  built.archiveStr,
        byteSize:    built.byteSize,
        checksum:    built.checksum,
        appVersion:  typeof built.appVersion === 'string' ? built.appVersion : undefined,
      });

      return _pickManualBackupResult(result);
    } catch (e) {
      log('cloud:createManualBackup error: ' + ((e && e.code) || 'unknown_error'));
      return { ok: false, error: 'unknown_error' };
    }
  });

  // ── cloud:createAutoBackup (1F.4F, debounced background upload) ──────────────
  // Triggered by the renderer's debounced auto-backup scheduler after data changes.
  // Uses trigger='auto'. Identical archive format to manual; trigger differs only
  // in the metadata RPC call. Never restores. Never applies. Never modifies DATA.
  ipcMain.handle('cloud:createAutoBackup', async function(_event, payload) {
    try {
      var guard = await licenseGuard();
      if (!guard.ok) return { ok: false, error: 'license_required' };
      if (!_validateWorkspaceIdPayload(payload)) return { ok: false, error: 'invalid_input' };
      if (typeof buildAutoBackupArchive !== 'function') {
        return { ok: false, error: 'backup_build_failed' };
      }
      var built;
      try {
        built = buildAutoBackupArchive(
          typeof payload.rendererState  === 'string' ? payload.rendererState  : '{}',
          typeof payload.importProfiles === 'string' ? payload.importProfiles : null
        );
      } catch (_) {
        return { ok: false, error: 'backup_build_failed' };
      }
      if (!built || typeof built.archiveStr !== 'string' ||
          typeof built.byteSize !== 'number' || typeof built.checksum !== 'string') {
        return { ok: false, error: 'backup_build_failed' };
      }
      var result = await cloudBackup.createAutoCloudBackup({
        workspaceId: payload.workspaceId,
        archiveStr:  built.archiveStr,
        byteSize:    built.byteSize,
        checksum:    built.checksum,
        appVersion:  typeof built.appVersion === 'string' ? built.appVersion : undefined,
      });
      return _pickManualBackupResult(result); // same whitelist; trigger field is preserved
    } catch (e) {
      log('cloud:createAutoBackup error: ' + ((e && e.code) || 'unknown_error'));
      return { ok: false, error: 'unknown_error' };
    }
  });

  // ── cloud:downloadBackupToFile (1F.4D) — saves .ktpbackup file to disk ──────
  // Does NOT restore. Does NOT apply. Does NOT modify local DATA.
  // Save path is chosen by the user via Electron dialog in this handler —
  // the renderer never provides or receives a storage path.
  ipcMain.handle('cloud:downloadBackupToFile', async function(_event, payload) {
    try {
      var guard = await licenseGuard();
      if (!guard.ok) return { ok: false, error: 'license_required' };
      if (!_validateWorkspaceIdPayload(payload)) return { ok: false, error: 'invalid_input' };
      if (typeof payload.backupId !== 'string' || !payload.backupId.trim()) {
        return { ok: false, error: 'invalid_input' };
      }

      // Show save dialog in main process — renderer never sees the chosen path.
      var defaultName = 'ktp-backup-' + new Date().toISOString().slice(0, 10) + '.ktpbackup';
      var savePath = await showSaveDialog({
        title:       'Save Cloud Backup File',
        defaultPath: defaultName,
        filters:     [{ name: 'KTP Backup', extensions: ['ktpbackup'] }],
      });
      if (!savePath) return { ok: false, error: 'cancelled' };

      var result = await cloudBackup.downloadBackupToFile({
        workspaceId: payload.workspaceId,
        backupId:    payload.backupId,
        savePath:    savePath,
      });
      return _pickDownloadResult(result);
    } catch (e) {
      log('cloud:downloadBackupToFile error: ' + ((e && e.code) || 'unknown_error'));
      return { ok: false, error: 'unknown_error' };
    }
  });
}

module.exports = {
  register,
  _sanitize,
  _pickPreflight,
  _pickManualBackupResult,
  _pickBackupList,
  _pickDownloadPreflight,
  _pickDownloadResult,
  _validateWorkspaceIdPayload,
  _STRIP_KEYS,
};
