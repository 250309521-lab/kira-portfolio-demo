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

const IS_DEV = process.argv.includes('--dev') || !app.isPackaged;
const APP_VER = app.getVersion();

const USER_DATA = app.getPath('userData');
const DB_PATH = path.join(USER_DATA, 'kiratakip-data.json');
const LEGACY_DB_PATH = path.join(USER_DATA, 'kiratakip.db');
const BACKUP_DIR = path.join(USER_DATA, 'backups');
const LOG_PATH = path.join(USER_DATA, 'app.log');

[USER_DATA, BACKUP_DIR].forEach(dir => {
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
      pin_hash: '1234',
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
    const filename = `backup-${ts}-${trigger}.json`;
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
      .filter(f => f.includes(`-${trigger}.json`) || f.includes(`-${trigger}.db`))
      .map(f => ({ name: f, time: fs.statSync(path.join(BACKUP_DIR, f)).mtime.getTime() }))
      .sort((a, b) => b.time - a.time);
    files.slice(keep).forEach(f => { try { fs.unlinkSync(path.join(BACKUP_DIR, f.name)); } catch {} });
  } catch {}
}

function setupIPC() {
  ipcMain.handle('app:info', () => ({
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
  }));

  ipcMain.handle('settings:get', (_, key) => store?.settings?.[key] ?? null);

  ipcMain.handle('settings:set', (_, key, value) => {
    store.settings[key] = String(value);
    saveStore();
    return true;
  });

  ipcMain.handle('settings:getAll', () => ({ ...(store?.settings || {}) }));

  ipcMain.handle('backup:create', (_, trigger = 'manual') => autoBackup(trigger));

  ipcMain.handle('backup:list', () => {
    try {
      return fs.readdirSync(BACKUP_DIR)
        .filter(f => f.endsWith('.db') || f.endsWith('.json'))
        .map(f => {
          const fp = path.join(BACKUP_DIR, f);
          const st = fs.statSync(fp);
          return { filename: f, path: fp, size: st.size, mtime: st.mtime.toISOString() };
        })
        .sort((a, b) => b.mtime.localeCompare(a.mtime));
    } catch { return []; }
  });

  ipcMain.handle('backup:restore', async (_, backupPath) => {
    if (!backupPath) return { ok: false, error: 'No backup path provided' };
    if (!fs.existsSync(backupPath)) return { ok: false, error: 'Backup file not found: ' + backupPath };
    try {
      const stat = fs.statSync(backupPath);
      if (stat.size === 0) return { ok: false, error: 'Backup file is empty — aborting restore' };
      const preRestoreBackup = autoBackup('pre-restore');
      const content = fs.readFileSync(backupPath, 'utf8');
      const parsed = JSON.parse(content);
      if (!parsed || typeof parsed !== 'object') return { ok: false, error: 'Invalid backup format' };
      store = parsed;
      saveStore();
      log('INFO', 'Data restored successfully', { from: backupPath });
      return { ok: true, preRestoreBackup: preRestoreBackup?.filename };
    } catch (err) {
      log('ERROR', 'Restore failed', { error: err.message, backupPath });
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('data:exportJSON', async (_, dataStr) => {
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
    shell.openPath(folderPath || USER_DATA);
    return true;
  });

  ipcMain.handle('fs:openBackupFolder', () => {
    shell.openPath(BACKUP_DIR);
    return true;
  });

  ipcMain.handle('audit:add', (_, entry) => {
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

  ipcMain.handle('audit:list', (_, limit = 200) => store.audit_log.slice(0, Number(limit) || 200));

  ipcMain.handle('users:getAll', () => store.users.map(u => ({
    id: u.id,
    name: u.name,
    avatar: u.avatar,
    role: u.role,
    color: u.color,
    active: u.active,
    created_at: u.created_at
  })));

  ipcMain.handle('users:upsert', (_, user) => {
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
    const user = store.users.find(u => u.id === userId);
    if (user) {
      user.active = 0;
      user.updated_at = new Date().toISOString();
      saveStore();
    }
    return true;
  });

  ipcMain.handle('app:status', () => {
    const backupFiles = fs.existsSync(BACKUP_DIR)
      ? fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.db') || f.endsWith('.json')).length
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

  ipcMain.handle('clipboard:read', () => clipboard.readText());
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
    titleBarOverlay: { color: '#060d1a', symbolColor: '#94a3b8', height: 52 },
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: true,
      allowRunningInsecureContent: false,
    }
  });

  if (!IS_DEV) mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, 'renderer.html'));
  mainWindow.once('ready-to-show', () => {
    const MIN_SPLASH = 1800;
    const elapsed = splashStart ? Date.now() - splashStart : MIN_SPLASH;
    const waitMs  = Math.max(0, MIN_SPLASH - elapsed);
    setTimeout(() => {
      // Show main behind splash (alwaysOnTop keeps splash in front during fade)
      mainWindow.show();
      mainWindow.maximize();
      if (IS_DEV) mainWindow.webContents.openDevTools({ mode: 'detach' });
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
