/**
 * Kira Takip Pro — Electron Main Process
 * v5.1.1 portable-friendly build
 *
 * This version intentionally avoids native database modules such as better-sqlite3.
 * It uses a small JSON-backed persistence layer in Electron's userData folder so
 * `npm install` works on normal Windows laptops without Visual Studio Build Tools.
 */

'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell, clipboard, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { getMachineFingerprint } = require('./machine-id');
const { verifyLicenseJson }     = require('./license-verifier');
const cloudBackupModule         = require('./cloud/cloud-backup');
const cloudSyncModule           = require('./cloud/cloud-sync');

const IS_DEV = process.argv.includes('--dev') || !app.isPackaged;
const APP_VER = app.getVersion();

const USER_DATA = app.getPath('userData');
const DB_PATH = path.join(USER_DATA, 'kiratakip-data.json');
const LEGACY_DB_PATH = path.join(USER_DATA, 'kiratakip.db');
const BACKUP_DIR = path.join(USER_DATA, 'backups');
const LOG_PATH = path.join(USER_DATA, 'app.log');

const LICENSE_DIR            = path.join(USER_DATA, 'license');
const LICENSE_PATH           = path.join(LICENSE_DIR, 'active.ktplicense');
const MAX_LICENSE_FILE_BYTES = 64 * 1024;

[USER_DATA, BACKUP_DIR, LICENSE_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

function log(level, msg, data) {
  const line = `[${new Date().toISOString()}] [${level}] ${msg}${data ? ' ' + JSON.stringify(data) : ''}\n`;
  try { fs.appendFileSync(LOG_PATH, line); } catch {}
  if (IS_DEV) console.log(line.trim());
}

const DEFAULT_STORE = {
  schemaVersion: 2,
  settings: {
    auto_save: '1',
    cloud_url: '',
    cloud_enabled: '0',
    last_sync: '',
    selected_month: '',
    theme: 'dark'
  },
  users: [
    {
      id: 'admin',
      name: 'Yönetici',
      avatar: 'Y',
      role: 'admin',
      pin_hash: '',
      color: '#3b82f6',
      active: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  ],
  audit_log: [],
  backup_records: []
};

let store = null;

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function atomicWriteJSON(filePath, data) {
  const temp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(temp, filePath);
}

// ── Full backup archive helpers (LOCAL-BACKUP-1) ───────────────────────────────
const BACKUP_FORMAT_VERSION = 1;
const MAX_KTPBACKUP_BYTES = 100 * 1024 * 1024;

function sha256(str) {
  return crypto.createHash('sha256').update(str, 'utf8').digest('hex');
}

function buildFullBackup(rendererStateStr, importProfilesStr, trigger) {
  const ipStr = typeof importProfilesStr === 'string' ? importProfilesStr : null;
  const mainStoreData = {
    schemaVersion: store.schemaVersion || 2,
    settings: store.settings || {},
    audit_log: Array.isArray(store.audit_log) ? store.audit_log : [],
    backup_records: Array.isArray(store.backup_records) ? store.backup_records : [],
  };
  const mainStoreStr = JSON.stringify(mainStoreData);
  let workspaceId = '';
  try { workspaceId = (JSON.parse(rendererStateStr || '{}')).workspaceId || ''; } catch {}
  const manifest = {
    formatVersion: BACKUP_FORMAT_VERSION,
    appVersion: APP_VER,
    mainStoreSchemaVersion: store.schemaVersion || 2,
    createdAt: new Date().toISOString(),
    trigger: String(trigger || 'manual'),
    workspaceId,
    checksums: {
      rendererState: sha256(rendererStateStr || ''),
      mainStore: sha256(mainStoreStr),
      importProfiles: ipStr !== null ? sha256(ipStr) : null,
    },
  };
  return { manifest, rendererState: rendererStateStr || '{}', mainStore: mainStoreStr, importProfiles: ipStr };
}

function validateFullBackup(archive) {
  if (!archive || typeof archive !== 'object') return { ok: false, errors: ['Not a valid backup object'] };
  const errors = [];
  if (!archive.manifest || typeof archive.manifest !== 'object') {
    return { ok: false, errors: ['Missing or invalid manifest'] };
  }
  if (typeof archive.manifest.formatVersion !== 'number') {
    errors.push('manifest.formatVersion missing');
  } else if (archive.manifest.formatVersion > BACKUP_FORMAT_VERSION) {
    return { ok: false, errors: ['This backup was created with a newer version of the app. Please update.'] };
  }
  if (!archive.manifest.checksums) errors.push('manifest.checksums missing');
  if (typeof archive.rendererState !== 'string') errors.push('Missing rendererState section');
  if (typeof archive.mainStore !== 'string') errors.push('Missing mainStore section');
  if (errors.length > 0) return { ok: false, errors };
  const { checksums } = archive.manifest;
  if (sha256(archive.rendererState) !== checksums.rendererState)
    errors.push('rendererState checksum mismatch — file may be corrupted or tampered');
  if (sha256(archive.mainStore) !== checksums.mainStore)
    errors.push('mainStore checksum mismatch — file may be corrupted or tampered');
  if (archive.importProfiles !== null && archive.importProfiles !== undefined && checksums.importProfiles) {
    if (sha256(archive.importProfiles) !== checksums.importProfiles)
      errors.push('importProfiles checksum mismatch — file may be corrupted or tampered');
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, manifest: archive.manifest };
}

// ── _applyArchiveInternal — shared restore helper (1F.6C) ─────────────────────
// Shared by backup:restoreFull (local file) and backup:restoreFromCloud (cloud).
// NEVER call without running validateFullBackup first.
// Creates a mandatory pre-restore safety backup before any mutation.
// Returns rendererState/importProfiles for renderer to write to localStorage.
// manifest.checksums are intentionally stripped from the return value.
async function _applyArchiveInternal(archive, preRestoreRendererState, preRestoreImportProfiles) {
  if (!preRestoreRendererState) {
    return { ok: false, error: 'pre_restore_state_required' };
  }

  // Mandatory pre-restore safety backup — failure blocks the apply.
  let safetyBackupCreated = false;
  try {
    if (!store) initDatabase();
    saveStore();
    const preArchive = buildFullBackup(
      preRestoreRendererState,
      preRestoreImportProfiles || null,
      'pre-restore'
    );
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const prePath = path.join(BACKUP_DIR, `backup-${ts}-pre-restore.ktpbackup`);
    atomicWriteJSON(prePath, preArchive);
    log('INFO', 'Pre-restore safety backup created', { path: prePath });
    safetyBackupCreated = true;
  } catch (e) {
    log('WARN', 'Pre-restore safety backup failed — blocking apply', { error: e.message });
    return { ok: false, error: 'safety_backup_failed' };
  }

  // Apply mainStore (safe fields only — license dir untouched).
  try {
    const mainStoreData = JSON.parse(archive.mainStore);
    if (mainStoreData && typeof mainStoreData === 'object') {
      if (mainStoreData.settings)                        store.settings      = mainStoreData.settings;
      if (Array.isArray(mainStoreData.audit_log))        store.audit_log     = mainStoreData.audit_log;
      if (Array.isArray(mainStoreData.backup_records))   store.backup_records = mainStoreData.backup_records;
      if (mainStoreData.schemaVersion)                   store.schemaVersion = mainStoreData.schemaVersion;
      saveStore();
    }
  } catch (e) {
    log('ERROR', 'mainStore apply failed', { error: e.message });
    return { ok: false, error: 'apply_failed' };
  }

  // Sanitized manifest — checksums stripped (internal detail, not needed by renderer).
  const sanitizedManifest = {
    formatVersion:          archive.manifest.formatVersion          || null,
    appVersion:             archive.manifest.appVersion             || null,
    mainStoreSchemaVersion: archive.manifest.mainStoreSchemaVersion || null,
    createdAt:              archive.manifest.createdAt              || null,
    trigger:                archive.manifest.trigger                || null,
    workspaceId:            archive.manifest.workspaceId            || null,
    // checksums INTENTIONALLY STRIPPED
  };

  return {
    ok:                  true,
    safetyBackupCreated: safetyBackupCreated,
    safetyBackupLabel:   'pre-restore',
    rendererState:       archive.rendererState,       // validated — for renderer localStorage write
    importProfiles:      archive.importProfiles || null,
    manifest:            sanitizedManifest,
    reloadRequired:      true,
  };
}

function saveStore() {
  if (!store) return;
  atomicWriteJSON(DB_PATH, store);
}

function initDatabase() {
  try {
    if (fs.existsSync(DB_PATH)) {
      store = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    } else {
      store = clone(DEFAULT_STORE);
      saveStore();
    }

    if (!store.settings) store.settings = clone(DEFAULT_STORE.settings);
    if (!Array.isArray(store.users)) store.users = clone(DEFAULT_STORE.users);
    if (!Array.isArray(store.audit_log)) store.audit_log = [];
    if (!Array.isArray(store.backup_records)) store.backup_records = [];
    if (!store.schemaVersion || store.schemaVersion < 2) store.schemaVersion = 2;

    saveStore();
    log('INFO', 'JSON data store initialised', { path: DB_PATH });
  } catch (err) {
    log('ERROR', 'JSON data store init failed, creating clean store', { error: err.message });
    store = clone(DEFAULT_STORE);
    saveStore();
  }
}

function autoBackup(trigger = 'auto') {
  try {
    if (!store) initDatabase();
    saveStore();
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const safeTrigger = String(trigger || 'auto').replace(/[^a-z0-9_-]/gi, '_').slice(0, 40);
    const filename = `backup-${ts}-${safeTrigger}.json`;
    const destPath = path.join(BACKUP_DIR, filename);
    fs.copyFileSync(DB_PATH, destPath);
    const stats = fs.statSync(destPath);
    if (stats.size === 0) {
      try { fs.unlinkSync(destPath); } catch {}
      return null;
    }
    const record = {
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      filename,
      path: destPath,
      size_bytes: stats.size,
      created_at: new Date().toISOString(),
      trigger
    };
    store.backup_records.unshift(record);
    saveStore();
    cleanOldBackups('auto', 24);
    log('INFO', 'Backup created', { filename });
    return { filename, path: destPath, size: stats.size };
  } catch (err) {
    log('ERROR', 'Backup failed', { error: err.message });
    return null;
  }
}

function cleanOldBackups(trigger, keep) {
  try {
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.includes(`-${trigger}.json`) || f.includes(`-${trigger}.db`) || f.includes(`-${trigger}.ktpbackup`))
      .map(f => ({ name: f, time: fs.statSync(path.join(BACKUP_DIR, f)).mtime.getTime() }))
      .sort((a, b) => b.time - a.time);
    files.slice(keep).forEach(f => { try { fs.unlinkSync(path.join(BACKUP_DIR, f.name)); } catch {} });
  } catch {}
}

function _readActiveLicense() {
  if (!fs.existsSync(LICENSE_PATH)) {
    return { ok: false, reason: 'no_license' };
  }

  try {
    const stat = fs.statSync(LICENSE_PATH);
    if (stat.size > MAX_LICENSE_FILE_BYTES) {
      return { ok: false, reason: 'read_error', message: 'License file exceeds size limit' };
    }

    const text = fs.readFileSync(LICENSE_PATH, 'utf8');
    return { ok: true, text };
  } catch {
    return { ok: false, reason: 'read_error', message: 'Unable to read license file' };
  }
}

// ── License guard — defense-in-depth for sensitive IPC handlers ───────────────
// Verifies the active license at most once per GUARD_TTL_MS.
// Set _guardCacheTs = 0 to force an immediate re-check on the next call.

let _guardCache   = null;
let _guardCacheTs = 0;
const GUARD_TTL_MS = 5000;

function licenseGuard() {
  if (_guardCache && (Date.now() - _guardCacheTs) < GUARD_TTL_MS) return _guardCache;
  const read = _readActiveLicense();
  if (!read.ok) {
    _guardCache = { ok: false, reason: 'license_required' };
    _guardCacheTs = Date.now();
    return _guardCache;
  }
  const result = verifyLicenseJson(read.text, getMachineFingerprint());
  _guardCache   = result.ok ? { ok: true } : { ok: false, reason: 'license_required' };
  _guardCacheTs = Date.now();
  return _guardCache;
}

function setupIPC() {
  ipcMain.handle('app:info', () => {
    if (!licenseGuard().ok) return { version: APP_VER, isDev: IS_DEV, platform: process.platform };
    return {
      version: APP_VER,
      dbPath: DB_PATH,
      legacyDbPath: LEGACY_DB_PATH,
      backupDir: BACKUP_DIR,
      userData: USER_DATA,
      logPath: LOG_PATH,
      storageEngine: 'json',
      isDev: IS_DEV,
      platform: process.platform,
      nodeVersion: process.versions.node,
      electronVersion: process.versions.electron,
    };
  });

  ipcMain.handle('settings:get', (_, key) => {
    if (!licenseGuard().ok) return null;
    return store?.settings?.[key] ?? null;
  });

  ipcMain.handle('settings:set', (_, key, value) => {
    if (!licenseGuard().ok) return false;
    store.settings[key] = String(value);
    saveStore();
    return true;
  });

  ipcMain.handle('settings:getAll', () => {
    if (!licenseGuard().ok) return {};
    return { ...(store?.settings || {}) };
  });

  ipcMain.handle('backup:create', (_, trigger = 'manual') => {
    if (!licenseGuard().ok) return null;
    return autoBackup(trigger);
  });

  ipcMain.handle('backup:list', () => {
    if (!licenseGuard().ok) return [];
    try {
      return fs.readdirSync(BACKUP_DIR)
        .filter(f => f.endsWith('.db') || f.endsWith('.json') || f.endsWith('.ktpbackup'))
        .map(f => {
          const fp = path.join(BACKUP_DIR, f);
          const st = fs.statSync(fp);
          return { filename: f, path: fp, size: st.size, mtime: st.mtime.toISOString(), isFull: f.endsWith('.ktpbackup') };
        })
        .sort((a, b) => b.mtime.localeCompare(a.mtime));
    } catch { return []; }
  });

  ipcMain.handle('backup:restore', async (_, backupPath) => {
    if (!licenseGuard().ok) return { ok: false, reason: 'license_required' };
    if (!backupPath) return { ok: false, error: 'No backup path provided' };
    // Confine restores to the approved backup directory
    const resolved = path.resolve(String(backupPath));
    const backupDirResolved = path.resolve(BACKUP_DIR);
    if (!resolved.startsWith(backupDirResolved + path.sep) && resolved !== backupDirResolved) {
      log('WARN', 'backup:restore blocked — path outside BACKUP_DIR', { path: resolved });
      return { ok: false, error: 'Invalid backup path' };
    }
    if (!fs.existsSync(resolved)) return { ok: false, error: 'Backup file not found' };
    try {
      const stat = fs.statSync(resolved);
      if (stat.size === 0) return { ok: false, error: 'Backup file is empty — aborting restore' };
      const preRestoreBackup = autoBackup('pre-restore');
      const content = fs.readFileSync(resolved, 'utf8');
      const parsed = JSON.parse(content);
      if (!parsed || typeof parsed !== 'object') return { ok: false, error: 'Invalid backup format' };
      store = parsed;
      saveStore();
      log('INFO', 'Data restored successfully', { from: resolved });
      return { ok: true, preRestoreBackup: preRestoreBackup?.filename };
    } catch (err) {
      log('ERROR', 'Restore failed', { error: err.message, backupPath: resolved });
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('data:exportJSON', async (_, dataStr) => {
    if (!licenseGuard().ok) return { ok: false, reason: 'license_required' };
    const { filePath, canceled } = await dialog.showSaveDialog({
      title: 'JSON Yedek Kaydet',
      defaultPath: path.join(os.homedir(), `KiraTakip_Yedek_${new Date().toISOString().slice(0,10)}.json`),
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (canceled || !filePath) return { ok: false };
    fs.writeFileSync(filePath, dataStr, 'utf8');
    store.backup_records.unshift({
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      filename: path.basename(filePath),
      path: filePath,
      size_bytes: Buffer.byteLength(dataStr),
      created_at: new Date().toISOString(),
      trigger: 'json-export'
    });
    saveStore();
    return { ok: true, path: filePath };
  });

  ipcMain.handle('data:importJSON', async () => {
    if (!licenseGuard().ok) return { ok: false, reason: 'license_required' };
    const { filePaths, canceled } = await dialog.showOpenDialog({
      title: 'JSON Yedek Seç',
      filters: [{ name: 'JSON Backup', extensions: ['json'] }],
      properties: ['openFile']
    });
    if (canceled || !filePaths.length) return { ok: false, canceled: true };
    try {
      const stat = fs.statSync(filePaths[0]);
      if (stat.size === 0) return { ok: false, error: 'Dosya boş (0 byte)' };
      if (stat.size > 50 * 1024 * 1024) return { ok: false, error: 'Dosya çok büyük (max 50MB)' };
      const content = fs.readFileSync(filePaths[0], 'utf8');
      const parsed = JSON.parse(content);
      if (!parsed || typeof parsed !== 'object') return { ok: false, error: 'Geçersiz JSON yapısı' };
      return { ok: true, data: content };
    } catch (err) {
      log('ERROR', 'JSON import failed', { error: err.message, file: filePaths[0] });
      return { ok: false, error: err instanceof SyntaxError ? 'JSON formatı bozuk: ' + err.message : err.message };
    }
  });

  ipcMain.handle('fs:openFolder', (_, folderPath) => {
    if (!licenseGuard().ok) return false;
    shell.openPath(folderPath || USER_DATA);
    return true;
  });

  ipcMain.handle('fs:openBackupFolder', () => {
    if (!licenseGuard().ok) return false;
    shell.openPath(BACKUP_DIR);
    return true;
  });

  ipcMain.handle('audit:add', (_, entry) => {
    if (!licenseGuard().ok) return false;
    store.audit_log.unshift({
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      ts: entry?.t || new Date().toISOString(),
      user_name: entry?.user || '',
      action: entry?.desc || entry?.action || '',
      details: entry?.details || null
    });
    store.audit_log = store.audit_log.slice(0, 5000);
    saveStore();
    return true;
  });

  ipcMain.handle('audit:list', (_, limit = 200) => {
    if (!licenseGuard().ok) return [];
    return store.audit_log.slice(0, Number(limit) || 200);
  });

  ipcMain.handle('users:getAll', () => {
    if (!licenseGuard().ok) return [];
    return store.users.map(u => ({
      id: u.id,
      name: u.name,
      avatar: u.avatar,
      role: u.role,
      color: u.color,
      active: u.active,
      created_at: u.created_at
    }));
  });

  ipcMain.handle('users:upsert', (_, user) => {
    if (!licenseGuard().ok) return false;
    if (!user || !user.id) return false;
    const now = new Date().toISOString();
    const existing = store.users.find(u => u.id === user.id);
    const next = {
      id: user.id,
      name: user.name || 'User',
      avatar: user.avatar || (user.name ? user.name[0] : 'U'),
      role: user.role || 'viewer',
      pin_hash: user.pin || user.pin_hash || existing?.pin_hash || '',
      color: user.color || '#3b82f6',
      active: user.active !== false ? 1 : 0,
      created_at: existing?.created_at || now,
      updated_at: now
    };
    if (existing) Object.assign(existing, next); else store.users.push(next);
    saveStore();
    return true;
  });

  ipcMain.handle('users:delete', (_, userId) => {
    if (!licenseGuard().ok) return false;
    const user = store.users.find(u => u.id === userId);
    if (user) {
      user.active = 0;
      user.updated_at = new Date().toISOString();
      saveStore();
    }
    return true;
  });

  ipcMain.handle('app:status', () => {
    if (!licenseGuard().ok) return { dbConnected: false, version: APP_VER };
    const backupFiles = fs.existsSync(BACKUP_DIR)
      ? fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.db') || f.endsWith('.json') || f.endsWith('.ktpbackup')).length
      : 0;
    return {
      dbConnected: store !== null,
      dbPath: DB_PATH,
      storageEngine: 'json',
      backupDir: BACKUP_DIR,
      backupCount: backupFiles,
      version: APP_VER,
    };
  });

  ipcMain.handle('clipboard:read', () => {
    if (!licenseGuard().ok) return null;
    return clipboard.readText();
  });

  ipcMain.handle('license:getMachineId', () => {
    const fp = getMachineFingerprint();
    if (!fp) {
      log('WARN', 'license:getMachineId — Machine GUID unavailable');
      return { ok: false, error: 'Machine GUID unavailable' };
    }
    return { ok: true, fingerprint: fp };
  });

  ipcMain.handle('license:check', () => {
    const read = _readActiveLicense();

    if (!read.ok) {
      log('INFO', 'license:check — no active license', { reason: read.reason });
      return {
        ok: false,
        reason: read.reason,
        ...(read.message ? { message: read.message } : {}),
      };
    }

    const currentFingerprint = getMachineFingerprint();
    const result = verifyLicenseJson(read.text, currentFingerprint);

    if (result.ok) {
      log('INFO', 'license:check — valid', {
        licenseId: result.license.licenseId,
        keyId:     result.license.keyId,
        plan:      result.license.plan,
        perpetual: result.license.perpetual,
        expiresAt: result.license.expiresAt,
      });

      return {
        ok:      true,
        reason:  'valid',
        license: {
          licenseId:  result.license.licenseId,
          keyId:      result.license.keyId,
          plan:       result.license.plan,
          customerId: result.license.customerId,
          expiresAt:  result.license.expiresAt,
          perpetual:  result.license.perpetual,
        },
      };
    }

    log('WARN', 'license:check — invalid', { reason: result.reason });

    return {
      ok:     false,
      reason: result.reason,
    };
  });

  ipcMain.handle('license:import', async () => {
    const { filePaths, canceled } = await dialog.showOpenDialog({
      title: 'Lisans Dosyası Seç / Select License File',
      filters: [{ name: 'KTP License', extensions: ['ktplicense'] }],
      properties: ['openFile']
    });
    if (canceled || !filePaths || !filePaths.length) {
      return { ok: false, reason: 'cancelled' };
    }

    const srcPath = filePaths[0];

    let stat;
    try { stat = fs.statSync(srcPath); } catch {
      return { ok: false, reason: 'read_error' };
    }
    if (stat.size === 0) return { ok: false, reason: 'read_error' };
    if (stat.size > MAX_LICENSE_FILE_BYTES) return { ok: false, reason: 'too_large' };

    let text;
    try { text = fs.readFileSync(srcPath, 'utf8'); } catch {
      return { ok: false, reason: 'read_error' };
    }

    const currentFingerprint = getMachineFingerprint();
    const result = verifyLicenseJson(text, currentFingerprint);
    if (!result.ok) {
      log('WARN', 'license:import — verification failed', { reason: result.reason });
      return { ok: false, reason: result.reason };
    }

    const BAK_PATH = LICENSE_PATH + '.bak';
    const TMP_PATH = LICENSE_PATH + '.tmp';
    try {
      if (fs.existsSync(LICENSE_PATH)) {
        try { fs.copyFileSync(LICENSE_PATH, BAK_PATH); }
        catch (bakErr) { log('WARN', 'license:import — backup failed', { error: bakErr.message }); }
      }
      fs.writeFileSync(TMP_PATH, text, 'utf8');
      fs.renameSync(TMP_PATH, LICENSE_PATH);
    } catch (err) {
      log('ERROR', 'license:import — install failed', { error: err.message });
      try { if (fs.existsSync(TMP_PATH)) fs.unlinkSync(TMP_PATH); } catch {}
      return { ok: false, reason: 'write_error' };
    }

    log('INFO', 'license:import — installed', {
      licenseId: result.license.licenseId,
      keyId:     result.license.keyId,
      plan:      result.license.plan,
      perpetual: result.license.perpetual,
    });

    _guardCacheTs = 0; // invalidate guard cache so guarded IPCs work immediately after import

    return {
      ok:     true,
      reason: 'imported',
      license: {
        licenseId:  result.license.licenseId,
        keyId:      result.license.keyId,
        plan:       result.license.plan,
        customerId: result.license.customerId,
        expiresAt:  result.license.expiresAt,
        perpetual:  result.license.perpetual,
      }
    };
  });

  ipcMain.handle('backup:createFull', async (_, payload) => {
    if (!licenseGuard().ok) return { ok: false, reason: 'license_required' };
    try {
      if (!store) initDatabase();
      saveStore();
      const rendererStateStr = typeof payload?.rendererState === 'string' ? payload.rendererState : '{}';
      const importProfilesStr = typeof payload?.importProfiles === 'string' ? payload.importProfiles : null;
      const trigger = String(payload?.trigger || 'manual');
      const archive = buildFullBackup(rendererStateStr, importProfilesStr, trigger);
      let destPath;
      if (trigger === 'manual') {
        const { filePath, canceled } = await dialog.showSaveDialog({
          title: 'Yedek Kaydet / Save Backup',
          defaultPath: path.join(os.homedir(), `KiraTakip_Yedek_${new Date().toISOString().slice(0, 10)}.ktpbackup`),
          filters: [{ name: 'KTP Backup', extensions: ['ktpbackup'] }],
        });
        if (canceled || !filePath) return { ok: false, canceled: true };
        destPath = filePath;
      } else {
        const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const safeTrigger = trigger.replace(/[^a-z0-9_-]/gi, '_').slice(0, 40);
        destPath = path.join(BACKUP_DIR, `backup-${ts}-${safeTrigger}.ktpbackup`);
      }
      atomicWriteJSON(destPath, archive);
      const stats = fs.statSync(destPath);
      store.backup_records.unshift({
        id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
        filename: path.basename(destPath),
        path: destPath,
        size_bytes: stats.size,
        created_at: new Date().toISOString(),
        trigger,
        format: 'ktpbackup',
      });
      saveStore();
      log('INFO', 'Full backup created', { filename: path.basename(destPath), trigger });
      return { ok: true, filename: path.basename(destPath), path: destPath, size: stats.size };
    } catch (err) {
      log('ERROR', 'Full backup failed', { error: err.message });
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('backup:restoreFull', async (_, payload) => {
    if (!licenseGuard().ok) return { ok: false, reason: 'license_required' };
    try {
      let filePath = payload?.filePath;
      if (!filePath) {
        const { filePaths, canceled } = await dialog.showOpenDialog({
          title: 'Yedek Seç / Select Backup',
          filters: [{ name: 'KTP Backup', extensions: ['ktpbackup'] }],
          properties: ['openFile'],
        });
        if (canceled || !filePaths || !filePaths.length) return { ok: false, canceled: true };
        filePath = filePaths[0];
      }
      const resolved = path.resolve(String(filePath));
      if (!fs.existsSync(resolved)) return { ok: false, error: 'Backup file not found' };
      const stat = fs.statSync(resolved);
      if (stat.size === 0) return { ok: false, error: 'Backup file is empty' };
      if (stat.size > MAX_KTPBACKUP_BYTES) return { ok: false, error: 'Backup file too large (max 100 MB)' };
      let archive;
      try { archive = JSON.parse(fs.readFileSync(resolved, 'utf8')); }
      catch (e) { return { ok: false, error: 'Backup file corrupted — JSON parse failed: ' + e.message }; }
      const validation = validateFullBackup(archive);
      if (!validation.ok) return { ok: false, error: validation.errors.join('; ') };
      // Delegate to shared helper — safety backup + mainStore apply.
      const result = await _applyArchiveInternal(archive, payload?.preRestoreRendererState, payload?.preRestoreImportProfiles);
      if (!result.ok) return { ok: false, error: result.error };
      log('INFO', 'Full backup restored', { from: resolved });
      return { ok: true, rendererState: result.rendererState, importProfiles: result.importProfiles, manifest: result.manifest };
    } catch (err) {
      log('ERROR', 'Full restore failed', { error: err.message });
      return { ok: false, error: err.message };
    }
  });

  // ── backup:restoreFromCloud (1F.6C) — owner-only, manual, fully gated ──────
  // Downloads a .ktpbackup from ktp-backups, validates it, creates a local
  // pre-restore safety backup, applies mainStore, returns rendererState/importProfiles
  // to renderer for localStorage write + reload.
  // Never mutates local data unless all preflight checks pass.
  // rendererState/importProfiles permitted in response (restore exception — see 1F.6B).
  ipcMain.handle('backup:restoreFromCloud', async (_, payload) => {
    if (!licenseGuard().ok) return { ok: false, error: 'license_required' };
    try {
      const { workspaceId, backupId, preRestoreRendererState, preRestoreImportProfiles } = payload || {};

      // Required inputs.
      if (!workspaceId || typeof workspaceId !== 'string') return { ok: false, error: 'invalid_input' };
      if (!backupId    || typeof backupId    !== 'string') return { ok: false, error: 'invalid_input' };
      if (!preRestoreRendererState)                        return { ok: false, error: 'pre_restore_state_required' };

      // Owner-only gate.
      const readiness = await cloudBackupModule.getCloudBackupReadiness(workspaceId);
      if (!readiness.ok) return { ok: false, error: readiness.error };
      if (readiness.role !== 'owner') return { ok: false, error: 'owner_required' };

      // Download archive content in memory (storage_path stays in main, never returned).
      const dlResult = await cloudBackupModule.getCloudBackupContent(workspaceId, backupId);
      if (!dlResult.ok) return { ok: false, error: dlResult.error };
      if (dlResult.byteSize > MAX_KTPBACKUP_BYTES) return { ok: false, error: 'file_too_large' };

      // Parse and validate archive (all SHA-256 checksums must pass).
      let archive;
      try { archive = JSON.parse(dlResult.content); }
      catch (e) { return { ok: false, error: 'invalid_archive_format' }; }
      const validation = validateFullBackup(archive);
      if (!validation.ok) return { ok: false, error: validation.errors.join('; ') };

      // Note on archive.manifest.workspaceId:
      // This field holds DATA.workspaceId (the LOCAL workspace UUID stored in the renderer),
      // NOT the cloud workspace UUID from ktp.workspaces.id. They are different ID spaces
      // linked by ktp.workspaces.local_workspace_id — never equal strings.
      // Cloud ownership is already proven by _callDownloadRpc → create_backup_download_url
      // RPC with RLS enforcement. Comparing them as a safety check would always block.
      // We log the informational comparison for auditing purposes only.
      if (archive.manifest.workspaceId) {
        log('INFO', 'cloud apply: archive local-workspace-id is informational only', {
          localWorkspaceId: archive.manifest.workspaceId ? '[present]' : '[absent]',
          cloudWorkspaceVerified: true, // proven by RPC/RLS above
        });
      }

      // Apply via shared helper — safety backup created first, then mainStore applied.
      const result = await _applyArchiveInternal(archive, preRestoreRendererState, preRestoreImportProfiles);
      if (!result.ok) return { ok: false, error: result.error };

      log('INFO', 'Cloud backup applied', { workspaceId, backupId });

      // Safe response — checksums already stripped by _applyArchiveInternal.
      // mainStore, storage_path, checksum, device_id, raw archive NEVER included.
      return {
        ok:                   true,
        appliedAt:            new Date().toISOString(),
        cloudBackupCreatedAt: archive.manifest.createdAt || null,
        cloudBackupByteSize:  dlResult.byteSize,
        safetyBackupCreated:  result.safetyBackupCreated,
        safetyBackupLabel:    result.safetyBackupLabel,
        reloadRequired:       true,
        rendererState:        result.rendererState,   // validated restore — allowed (see 1F.6B)
        importProfiles:       result.importProfiles,  // validated restore — allowed (see 1F.6B)
        manifest:             result.manifest,        // checksums stripped
      };
    } catch (err) {
      log('ERROR', 'Cloud backup apply failed', { error: err.message });
      return { ok: false, error: 'apply_failed' };
    }
  });

  // ── cloud:applyPulledSnapshot (1G.4C) — clean-only accepted SYNC apply ───────
  // SEPARATE from Cloud Backup Apply (emergency restore). Downloads + validates
  // the latest sync snapshot (content stays in main), creates a MANDATORY local
  // safety backup of the current renderer state, then returns the validated DATA
  // content for the renderer to write to localStorage. It applies DATA ONLY —
  // never mainStore, never the .ktpbackup archive path, never owner-only/dual-
  // confirm. Clean-state + explicit-accept gating is enforced in the renderer;
  // this handler additionally guarantees the safety backup precedes any content
  // hand-off. Content/storage_path/snapshot_hash are NEVER logged.
  ipcMain.handle('cloud:applyPulledSnapshot', async (_, payload) => {
    if (!licenseGuard().ok) return { ok: false, error: 'license_required' };
    try {
      const { workspaceId, baseRevision, preRestoreRendererState } = payload || {};
      if (!workspaceId || typeof workspaceId !== 'string') return { ok: false, error: 'invalid_input' };
      if (typeof baseRevision !== 'number' || !isFinite(baseRevision) ||
          baseRevision < 0 || Math.floor(baseRevision) !== baseRevision) return { ok: false, error: 'invalid_input' };
      if (!preRestoreRendererState || typeof preRestoreRendererState !== 'string') {
        return { ok: false, error: 'pre_restore_state_required' };
      }

      // 1) Download + validate the target snapshot (content held in main only).
      const pulled = await cloudSyncModule.pullSnapshotForApply({ workspaceId, baseRevision });
      if (!pulled.ok) return { ok: false, error: pulled.error };
      if (typeof pulled.content !== 'string' || !pulled.content) return { ok: false, error: 'apply_failed' };

      // 2) MANDATORY local safety backup BEFORE any content is handed to the
      //    renderer. Failure blocks the apply (no content returned → no write).
      //    Uses the local backup-file mechanism — NOT Cloud Backup Apply/restore.
      try {
        if (!store) initDatabase();
        saveStore();
        const preArchive = buildFullBackup(preRestoreRendererState, null, 'pre-sync-pull');
        const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const prePath = path.join(BACKUP_DIR, `backup-${ts}-pre-sync-pull.ktpbackup`);
        atomicWriteJSON(prePath, preArchive);
        log('INFO', 'Pre-sync-pull safety backup created', { path: prePath });
      } catch (e) {
        log('WARN', 'Pre-sync-pull safety backup failed — blocking apply', { error: e.message });
        return { ok: false, error: 'safety_backup_failed' };
      }

      // 3) Narrow accepted-apply exception: return validated DATA content for the
      //    renderer localStorage write. No storage_path/hash/url/device id/content log.
      return {
        ok:                  true,
        revision:            pulled.revision,
        byteSize:            pulled.byteSize,
        safetyBackupCreated: true,
        rendererState:       pulled.content,   // validated sync DATA — renderer LSKEY write only
      };
    } catch (err) {
      log('ERROR', 'Cloud sync apply failed', { error: err.message });
      return { ok: false, error: 'apply_failed' };
    }
  });

  // ── cloud:keepMineResolve (1G.5D) — explicit "Keep my version" conflict push ─
  // Pushes the dirty local snapshot as the next cloud revision via the existing
  // CAS RPC (baseRevision = the conflict cloud revision). It first creates a
  // MANDATORY local safety backup of the local state being kept (local backup
  // mechanism — NOT Cloud Backup Apply). CAS is authoritative: if the cloud moved
  // again the push is rejected (stale → cloud_changed); local DATA is never
  // overwritten and the superseded cloud revision stays in append-only history.
  // Never logs/returns rendererState/content/storage_path/hash/device id/lease.
  ipcMain.handle('cloud:keepMineResolve', async (_, payload) => {
    if (!licenseGuard().ok) return { ok: false, error: 'license_required' };
    try {
      const { workspaceId, baseRevision, rendererState } = payload || {};
      if (!workspaceId || typeof workspaceId !== 'string') return { ok: false, error: 'invalid_input' };
      if (typeof baseRevision !== 'number' || !isFinite(baseRevision) ||
          baseRevision < 0 || Math.floor(baseRevision) !== baseRevision) return { ok: false, error: 'invalid_input' };
      if (!rendererState || typeof rendererState !== 'string') return { ok: false, error: 'invalid_input' };

      // 1) MANDATORY local safety backup of the kept (dirty) local state BEFORE the
      //    push. Failure blocks the push. Uses the local backup-file mechanism.
      try {
        if (!store) initDatabase();
        saveStore();
        const preArchive = buildFullBackup(rendererState, null, 'pre-keep-mine');
        const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const prePath = path.join(BACKUP_DIR, `backup-${ts}-pre-keep-mine.ktpbackup`);
        atomicWriteJSON(prePath, preArchive);
        log('INFO', 'Pre-keep-mine safety backup created', { path: prePath });
      } catch (e) {
        log('WARN', 'Pre-keep-mine safety backup failed — blocking push', { error: e.message });
        return { ok: false, error: 'safety_backup_failed' };
      }

      // 2) CAS-push local snapshot as the next revision (base_revision = cloud head).
      let deviceId = null;
      try { deviceId = await require('./cloud/cloud-workspace').getOrCreateDeviceId(); } catch (_) { deviceId = null; }
      const result = await cloudSyncModule.pushWorkspaceSnapshot({
        workspaceId:  workspaceId,
        baseRevision: baseRevision,
        snapshotStr:  rendererState,
        byteSize:     Buffer.byteLength(rendererState, 'utf8'),
        snapshotHash: cloudSyncModule.computeSnapshotHash(rendererState),
        deviceId:     deviceId,
        appVersion:   APP_VER,
      });

      // 3) Sanitized result. stale_revision = the cloud advanced again → cloud_changed.
      if (result && result.ok === true) {
        return { ok: true, newRevision: (typeof result.newRevision === 'number' ? result.newRevision : null), safetyBackupCreated: true };
      }
      if (result && result.error === 'stale_revision') {
        return { ok: false, error: 'cloud_changed', currentRevision: (typeof result.currentRevision === 'number' ? result.currentRevision : null), safetyBackupCreated: true };
      }
      return { ok: false, error: (result && typeof result.error === 'string') ? result.error : 'push_failed', safetyBackupCreated: true };
    } catch (err) {
      log('ERROR', 'Cloud sync keep-mine failed', { error: err.message });
      return { ok: false, error: 'keep_mine_failed' };
    }
  });

  // ── Cloud Auth (CLOUD-FOUNDATION-1B.2c) ──────────────────────────────────
  require('./cloud/cloud-ipc').register(ipcMain, licenseGuard, log);

  // ── Cloud Workspace (CLOUD-FOUNDATION-1E.3) ───────────────────────────────
  require('./cloud/cloud-workspace-ipc').register(ipcMain, licenseGuard, log);

  // ── Cloud Backup readiness/preflight + manual upload (CLOUD-FOUNDATION-1F.4A/1F.4B) ──
  // _buildBackupDescriptor builds the full backup IN MEMORY only — it never
  // writes a file. buildPreflightArchive (read-only) discards the archive
  // string and keeps only size/checksum. buildManualBackupArchive (1F.4B,
  // guarded write path) additionally returns the archive string so
  // cloud-backup.js can upload the exact bytes that were checksummed.
  function _buildBackupDescriptor(rendererStateStr, importProfilesStr) {
    if (!store) initDatabase();
    var archive    = buildFullBackup(rendererStateStr || '{}', importProfilesStr || null, 'manual');
    var archiveStr = JSON.stringify(archive);
    return {
      archiveStr: archiveStr,
      byteSize:   Buffer.byteLength(archiveStr, 'utf8'),
      checksum:   sha256(archiveStr),
      appVersion: APP_VER,
    };
  }

  require('./cloud/cloud-backup-ipc').register(ipcMain, licenseGuard, log, {
    buildPreflightArchive: function(rendererStateStr, importProfilesStr) {
      var d = _buildBackupDescriptor(rendererStateStr, importProfilesStr);
      return { byteSize: d.byteSize, checksum: d.checksum, appVersion: d.appVersion };
    },
    buildManualBackupArchive: function(rendererStateStr, importProfilesStr) {
      return _buildBackupDescriptor(rendererStateStr, importProfilesStr);
    },
    buildAutoBackupArchive: function(rendererStateStr, importProfilesStr) {
      return _buildBackupDescriptor(rendererStateStr, importProfilesStr);
    },
    getLastLocalBackupAt: function() {
      try {
        if (!store || !Array.isArray(store.backup_records) || !store.backup_records.length) return null;
        return store.backup_records[0].created_at || null;
      } catch (_) { return null; }
    },
  });

  // ── Real Sync: auto-push whole-workspace snapshot with CAS (CLOUD-FOUNDATION-1G.2) ──
  // SEPARATE from cloud backup. Pushes the serialized whole-workspace snapshot to
  // ktp-snapshots with compare-and-swap. byteSize + sha256 + device id + app
  // version are computed/resolved here in main; the renderer only sends the
  // serialized state, workspace id, and its base revision. Default-OFF in the
  // renderer (window.KTP_REAL_SYNC_PUSH_ENABLED) — this handler is inert until
  // the renderer auto-push is enabled. Never pulls, applies, or touches backup.
  require('./cloud/cloud-sync-ipc').register(ipcMain, licenseGuard, log, {
    getDeviceId: function() {
      try { return require('./cloud/cloud-workspace').getOrCreateDeviceId(); }
      catch (_) { return null; }
    },
    appVersion: APP_VER,
  });

  ipcMain.on('titlebar:setColor', (_, opts) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setTitleBarOverlay({ height: 52, ...opts });
    }
  });
}

let mainWindow  = null;
let splashWin   = null;
let splashStart = 0;

function createSplashWindow() {
  splashStart = Date.now();
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  splashWin = new BrowserWindow({
    width: 480,
    height: 300,
    x: Math.round((width  - 480) / 2),
    y: Math.round((height - 300) / 2),
    frame: false,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: '#060d1a',
    show: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      devTools: IS_DEV,
      preload: path.join(__dirname, 'splash-preload.js'),
    }
  });
  splashWin.loadFile(path.join(__dirname, 'splash.html'));
  splashWin.on('closed', () => { splashWin = null; });

  ipcMain.once('splash:done', () => {
    if (splashWin) { try { splashWin.close(); } catch {} splashWin = null; }
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.focus();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 950,
    minWidth: 780,
    minHeight: 560,
    title: 'Kira Takip Pro',
    icon: path.join(__dirname, '..', 'build', 'icon.ico'),
    backgroundColor: '#060d1a',
    frame: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: 'rgba(0,0,0,0)', symbolColor: '#94a3b8', height: 52 },
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: true,
      allowRunningInsecureContent: false,
      devTools: IS_DEV,
    }
  });

  if (!IS_DEV) mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, IS_DEV ? 'renderer.html' : 'renderer.min.html'));
  mainWindow.once('ready-to-show', () => {
    const MIN_SPLASH = 1800;
    const elapsed = splashStart ? Date.now() - splashStart : MIN_SPLASH;
    const waitMs  = Math.max(0, MIN_SPLASH - elapsed);
    setTimeout(() => {
      // Show main behind splash (alwaysOnTop keeps splash in front during fade)
      mainWindow.show();
      mainWindow.maximize();
      if (IS_DEV) mainWindow.webContents.openDevTools({ mode: 'detach' });
      mainWindow.webContents.on('devtools-opened', () => {
        if (!IS_DEV) mainWindow.webContents.closeDevTools();
      });
      // Trigger splash fade simultaneously — user sees main revealed as splash fades
      if (splashWin) splashWin.webContents.send('splash:fadeout');
    }, waitMs);
  });
  mainWindow.on('closed', () => { mainWindow = null; });

  setInterval(() => autoBackup('auto-5min'), 5 * 60 * 1000);
  log('INFO', 'Main window created');
}

app.whenReady().then(() => {
  initDatabase();
  setupIPC();
  createSplashWindow();
  createWindow();
  // Safety: if ready-to-show never fires within 8s, close splash and show main anyway
  setTimeout(() => {
    if (splashWin) { try { splashWin.close(); } catch {} splashWin = null; }
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (!mainWindow.isVisible()) { mainWindow.show(); mainWindow.maximize(); }
      mainWindow.focus();
    }
  }, 8000);
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    autoBackup('shutdown');
    app.quit();
  }
});

app.on('before-quit', () => autoBackup('shutdown'));

app.on('web-contents-created', (_, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    if (url === '' || url === 'about:blank') return { action: 'allow' };
    if (/^https?:\/\//.test(url)) { shell.openExternal(url).catch(() => {}); }
    return { action: 'deny' };
  });
  contents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) event.preventDefault();
  });
});
