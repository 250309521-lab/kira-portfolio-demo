/**
 * Kira Takip Pro — Production Server v2.0
 *
 * Multi-user, authenticated, conflict-aware sync server
 *
 * Usage:
 *   node server.js
 *   KTP_ADMIN_PASS=secret PORT=8787 node server.js
 *
 * Environment Variables (see ENVIRONMENT_VARIABLES.md):
 *   PORT                   HTTP port (default: 8787)
 *   KTP_ADMIN_PASS         Admin password for first-run setup
 *   KTP_SECRET             JWT signing secret (MUST change in production)
 *   KTP_DB_PATH            SQLite DB path (default: ./ktp_server.db)
 *   KTP_BACKUP_DIR         Backup dir (default: ./backups)
 *   WA_TOKEN               WhatsApp Cloud API token
 *   WA_PHONE_NUMBER_ID     WhatsApp phone number ID
 *   KTP_CORS_ORIGIN        Allowed CORS origin (default: *)
 *   NODE_ENV               'production' | 'development'
 */

'use strict';

const http     = require('http');
const fs       = require('fs');
const path     = require('path');
const crypto   = require('crypto');
const url      = require('url');
const os       = require('os');

// ── Config ────────────────────────────────────────────────────────────────────
const PORT         = Number(process.env.PORT        || 8787);
const SECRET       = process.env.KTP_SECRET         || generateDefaultSecret();
const ADMIN_PASS   = process.env.KTP_ADMIN_PASS     || 'admin1234';
const DB_PATH      = process.env.KTP_DB_PATH        || path.join(__dirname, 'ktp_server.db');
const BACKUP_DIR   = process.env.KTP_BACKUP_DIR     || path.join(__dirname, 'backups');
const CORS_ORIGIN  = process.env.KTP_CORS_ORIGIN    || '*';
const IS_DEV       = process.env.NODE_ENV !== 'production';
const WA_TOKEN     = process.env.WA_TOKEN           || '';
const WA_PHONE_ID  = process.env.WA_PHONE_NUMBER_ID || '';
const LOG_PATH     = path.join(__dirname, 'server.log');

if (!process.env.KTP_SECRET) {
  log('WARN', '⚠️  KTP_SECRET not set — using generated secret. Set it in .env for production!');
}

// ── Ensure dirs ───────────────────────────────────────────────────────────────
[BACKUP_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

// ── Logging ───────────────────────────────────────────────────────────────────
function log(level, msg, data) {
  const ts   = new Date().toISOString();
  const line = `[${ts}] [${level}] ${msg}${data ? ' ' + JSON.stringify(data) : ''}`;
  console.log(line);
  try { fs.appendFileSync(LOG_PATH, line + '\n'); } catch {}
}

// ── Simple SQLite-less storage (flat-file + in-memory for max compatibility) ──
// Falls back to JSON files when better-sqlite3 is unavailable (e.g. Render free tier)

let db = null;
let DB_STORE = {
  users: [],
  data: null,
  syncLog: [],
  waLog: [],
  auditLog: [],
};

// ── Try to load better-sqlite3 ────────────────────────────────────────────────
function tryLoadSQLite() {
  try {
    const Database = require('better-sqlite3');
    db = new Database(DB_PATH, { verbose: IS_DEV ? null : null });
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSQLiteSchema();
    log('INFO', '✅ SQLite database initialised', { path: DB_PATH });
    return true;
  } catch (e) {
    log('WARN', 'better-sqlite3 not available, using JSON flat-file storage', { error: e.message });
    initFlatStore();
    return false;
  }
}

// ── SQLite Schema ─────────────────────────────────────────────────────────────
function initSQLiteSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version     INTEGER PRIMARY KEY,
      applied_at  TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS users (
      id          TEXT PRIMARY KEY,
      username    TEXT NOT NULL UNIQUE,
      name        TEXT NOT NULL,
      avatar      TEXT,
      role        TEXT NOT NULL DEFAULT 'viewer'
                    CHECK(role IN ('admin','editor','viewer')),
      pass_hash   TEXT NOT NULL,
      pass_salt   TEXT NOT NULL,
      color       TEXT DEFAULT '#3b82f6',
      active      INTEGER DEFAULT 1,
      created_at  TEXT DEFAULT (datetime('now')),
      updated_at  TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token       TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL REFERENCES users(id),
      created_at  TEXT DEFAULT (datetime('now')),
      expires_at  TEXT NOT NULL,
      last_seen   TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS sync_store (
      id          INTEGER PRIMARY KEY CHECK(id=1),
      payload     TEXT,
      version     INTEGER DEFAULT 0,
      updated_at  TEXT DEFAULT (datetime('now')),
      updated_by  TEXT
    );
    CREATE TABLE IF NOT EXISTS sync_log (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      ts          TEXT DEFAULT (datetime('now')),
      user_id     TEXT,
      direction   TEXT,
      status      TEXT,
      bytes       INTEGER,
      msg         TEXT
    );
    CREATE TABLE IF NOT EXISTS audit_log (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      ts          TEXT DEFAULT (datetime('now')),
      user_id     TEXT,
      action      TEXT NOT NULL,
      details     TEXT
    );
    CREATE TABLE IF NOT EXISTS wa_log (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      ts          TEXT DEFAULT (datetime('now')),
      phone       TEXT,
      name        TEXT,
      building    TEXT,
      unit        TEXT,
      month_str   TEXT,
      status      TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user  ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_exp   ON sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_sync_log_ts    ON sync_log(ts);
    CREATE INDEX IF NOT EXISTS idx_audit_ts       ON audit_log(ts);
    INSERT OR IGNORE INTO sync_store(id, version) VALUES(1, 0);
  `);
  runSQLiteMigrations();
  seedAdminUser();
}

function runSQLiteMigrations() {
  const done = new Set(db.prepare('SELECT version FROM schema_version').all().map(r => r.version));
  const migrations = [
    { v: 1, sql: `ALTER TABLE users ADD COLUMN email TEXT;` },
    { v: 2, sql: `ALTER TABLE sync_store ADD COLUMN conflict_count INTEGER DEFAULT 0;` },
  ];
  for (const m of migrations) {
    if (done.has(m.v)) continue;
    try { db.exec(m.sql); } catch {}
    db.prepare('INSERT OR IGNORE INTO schema_version(version) VALUES(?)').run(m.v);
    log('INFO', `Migration v${m.v} applied`);
  }
}

// ── Flat-file fallback ────────────────────────────────────────────────────────
const FLAT_PATH = path.join(__dirname, 'ktp_store.json');
function initFlatStore() {
  if (fs.existsSync(FLAT_PATH)) {
    try { Object.assign(DB_STORE, JSON.parse(fs.readFileSync(FLAT_PATH, 'utf8'))); } catch {}
  }
  if (!DB_STORE.users.length) seedAdminFlat();
}
function saveFlat() {
  try { fs.writeFileSync(FLAT_PATH, JSON.stringify(DB_STORE, null, 2)); } catch(e) { log('ERROR', 'saveFlat failed', { e: e.message }); }
}

// ── Password hashing ──────────────────────────────────────────────────────────
function hashPassword(password, salt) {
  salt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha256').toString('hex');
  return { hash, salt };
}
function verifyPassword(password, hash, salt) {
  const { hash: h } = hashPassword(password, salt);
  return h === hash;
}

// ── Seed admin user ───────────────────────────────────────────────────────────
function seedAdminUser() {
  const exists = db.prepare('SELECT id FROM users WHERE role=?').get('admin');
  if (exists) return;
  const { hash, salt } = hashPassword(ADMIN_PASS);
  db.prepare(`INSERT INTO users(id,username,name,avatar,role,pass_hash,pass_salt,color)
    VALUES(?,?,?,?,?,?,?,?)`).run(
    'admin_' + Date.now(), 'malik', 'Malik (Sahip)', 'M', 'admin', hash, salt, '#3b82f6'
  );
  log('INFO', '✅ Default admin user created. Username: malik');
}
function seedAdminFlat() {
  const { hash, salt } = hashPassword(ADMIN_PASS);
  DB_STORE.users.push({ id: 'admin_1', username: 'malik', name: 'Malik (Sahip)',
    avatar: 'M', role: 'admin', pass_hash: hash, pass_salt: salt,
    color: '#3b82f6', active: true, created_at: new Date().toISOString() });
  saveFlat();
  log('INFO', '✅ Default admin user created (flat). Username: malik');
}

// ── JWT-like tokens (HMAC-SHA256 signed, no external dependency) ──────────────
function signToken(payload) {
  const header  = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body    = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig     = crypto.createHmac('sha256', SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}
function verifyToken(token) {
  try {
    const [header, body, sig] = token.split('.');
    const expected = crypto.createHmac('sha256', SECRET).update(`${header}.${body}`).digest('base64url');
    if (sig !== expected) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch { return null; }
}

// ── Auth helpers ──────────────────────────────────────────────────────────────
function issueToken(userId, role) {
  return signToken({ sub: userId, role, exp: Date.now() + 24 * 60 * 60 * 1000, iat: Date.now() });
}

function requireAuth(req) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  const payload = verifyToken(token);
  if (!payload) return null;
  // Look up user
  if (db) {
    const user = db.prepare('SELECT * FROM users WHERE id=? AND active=1').get(payload.sub);
    return user ? { ...user, tokenRole: payload.role } : null;
  }
  return DB_STORE.users.find(u => u.id === payload.sub && u.active !== false) || null;
}

function canEdit(user) { return user && (user.role === 'admin' || user.role === 'editor'); }
function isAdmin(user) { return user && user.role === 'admin'; }

// ── Request body parser ───────────────────────────────────────────────────────
const MAX_BODY_SIZE = 25 * 1024 * 1024; // 25MB
function body(req) {
  return new Promise((ok, fail) => {
    const chunks = [];
    let totalSize = 0;
    req.on('data', c => {
      totalSize += c.length;
      if (totalSize > MAX_BODY_SIZE) {
        fail(new Error(`Request body too large (max ${MAX_BODY_SIZE/1024/1024}MB)`));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try { ok(chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {}); }
      catch(e) { fail(e); }
    });
    req.on('error', fail);
  });
}

// ── Response helpers ──────────────────────────────────────────────────────────
function send(res, code, data) {
  const json = JSON.stringify(data);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(json),
    'Access-Control-Allow-Origin': CORS_ORIGIN,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
  });
  res.end(json);
}
function err(res, code, message, details) {
  send(res, code, { ok: false, error: message, details: details || null });
}

// ── Sync helpers ──────────────────────────────────────────────────────────────
function getServerData() {
  if (db) {
    const row = db.prepare('SELECT * FROM sync_store WHERE id=1').get();
    return row ? { payload: row.payload ? JSON.parse(row.payload) : null, version: row.version, updatedAt: row.updated_at, updatedBy: row.updated_by } : { payload: null, version: 0 };
  }
  return { payload: DB_STORE.data, version: DB_STORE.syncVersion || 0, updatedAt: DB_STORE.syncUpdatedAt };
}

function saveServerData(payload, userId) {
  const payloadStr = JSON.stringify(payload);
  if (db) {
    const row = db.prepare('SELECT version FROM sync_store WHERE id=1').get();
    const newVersion = (row?.version || 0) + 1;
    db.prepare(`UPDATE sync_store SET payload=?, version=?, updated_at=datetime('now'), updated_by=? WHERE id=1`)
      .run(payloadStr, newVersion, userId);
    return newVersion;
  }
  DB_STORE.data = payload;
  DB_STORE.syncVersion = (DB_STORE.syncVersion || 0) + 1;
  DB_STORE.syncUpdatedAt = new Date().toISOString();
  saveFlat();
  return DB_STORE.syncVersion;
}

function logSync(userId, direction, status, bytes, msg) {
  if (db) {
    db.prepare('INSERT INTO sync_log(user_id,direction,status,bytes,msg) VALUES(?,?,?,?,?)')
      .run(userId, direction, status, bytes || 0, msg || null);
  } else {
    DB_STORE.syncLog.push({ ts: new Date().toISOString(), userId, direction, status, bytes, msg });
    if (DB_STORE.syncLog.length > 500) DB_STORE.syncLog.splice(0, 100);
  }
}

function logAudit(userId, action, details) {
  if (db) {
    db.prepare('INSERT INTO audit_log(user_id, action, details) VALUES(?,?,?)')
      .run(userId, action, details ? JSON.stringify(details) : null);
  } else {
    DB_STORE.auditLog.push({ ts: new Date().toISOString(), userId, action, details });
    if (DB_STORE.auditLog.length > 1000) DB_STORE.auditLog.splice(0, 200);
    saveFlat();
  }
}

// ── Auto backup ───────────────────────────────────────────────────────────────
function autoBackup() {
  try {
    const ts  = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    if (db) {
      const dest = path.join(BACKUP_DIR, `server-backup-${ts}.db`);
      db.backup(dest);
      // Keep last 24
      const files = fs.readdirSync(BACKUP_DIR).filter(f => f.startsWith('server-backup-') && f.endsWith('.db')).sort();
      files.slice(0, -24).forEach(f => { try { fs.unlinkSync(path.join(BACKUP_DIR, f)); } catch {} });
    } else {
      const dest = path.join(BACKUP_DIR, `server-backup-${ts}.json`);
      fs.writeFileSync(dest, JSON.stringify(DB_STORE, null, 2));
      const files = fs.readdirSync(BACKUP_DIR).filter(f => f.startsWith('server-backup-') && f.endsWith('.json')).sort();
      files.slice(0, -24).forEach(f => { try { fs.unlinkSync(path.join(BACKUP_DIR, f)); } catch {} });
    }
    log('INFO', `Auto backup created`);
  } catch (e) { log('ERROR', 'Auto backup failed', { e: e.message }); }
}

// ── User DB helpers ───────────────────────────────────────────────────────────
function getAllUsers() {
  if (db) return db.prepare('SELECT id,username,name,avatar,role,color,active,created_at,updated_at FROM users ORDER BY created_at').all();
  return DB_STORE.users.map(({ pass_hash, pass_salt, ...u }) => u);
}
function getUserById(id) {
  if (db) return db.prepare('SELECT * FROM users WHERE id=?').get(id);
  return DB_STORE.users.find(u => u.id === id);
}
function getUserByUsername(username) {
  if (db) return db.prepare('SELECT * FROM users WHERE username=?').get(username.toLowerCase());
  return DB_STORE.users.find(u => u.username === username.toLowerCase());
}

// ── WhatsApp ──────────────────────────────────────────────────────────────────
async function sendWA(phone, text) {
  if (!WA_TOKEN || !WA_PHONE_ID) return { skipped: true };
  const clean = String(phone).replace(/\D/g, '');
  if (!clean) return { skipped: true, reason: 'No phone' };
  const resp = await fetch(`https://graph.facebook.com/v19.0/${WA_PHONE_ID}/messages`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: clean, type: 'text', text: { body: text } })
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(JSON.stringify(json));
  return json;
}

const MONTHS_TR = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
async function waReminderWorker() {
  const serverData = getServerData();
  if (!serverData.payload) return;
  const data = serverData.payload;
  const now = new Date();
  const month = `${MONTHS_TR[now.getMonth()]} ${now.getFullYear()}`;
  const sentKey = `sent_${month}`;

  let sentSet = new Set();
  if (db) {
    const rows = db.prepare("SELECT unit||':'||building AS k FROM wa_log WHERE month_str=? AND status='sent'").all(month);
    sentSet = new Set(rows.map(r => r.k));
  }

  for (const [bld, tenants] of Object.entries(data.tenants || {})) {
    for (const t of tenants) {
      if (!t.active || !t.rent || !t.phone) continue;
      const paid = ((data.payments || {})[t.id] || {})[month]?.paid || 0;
      if (paid >= t.rent) continue;
      const gun = Number(t.gun || 1);
      const overdue = new Date(now.getFullYear(), now.getMonth(), gun + 1, 9, 0, 0);
      if (now < overdue) continue;
      const key = `${t.unit}:${bld}`;
      if (sentSet.has(key)) continue;
      const msg = `Merhaba ${t.name}, ${bld} ${t.unit} için ${month} kira ödemeniz (₺${t.rent.toLocaleString('tr-TR')}) görünmüyor. Rica etsek kontrol edebilir misiniz?`;
      try {
        await sendWA(t.phone, msg);
        if (db) {
          db.prepare('INSERT INTO wa_log(phone,name,building,unit,month_str,status) VALUES(?,?,?,?,?,?)')
            .run(t.phone, t.name, bld, t.unit, month, 'sent');
        }
        log('INFO', `WA sent: ${t.name} (${bld} ${t.unit})`);
      } catch(e) {
        log('ERROR', `WA failed: ${t.name}`, { e: e.message });
        if (db) {
          db.prepare('INSERT INTO wa_log(phone,name,building,unit,month_str,status) VALUES(?,?,?,?,?,?)')
            .run(t.phone, t.name, bld, t.unit, month, 'error:' + e.message.slice(0, 100));
        }
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// HTTP ROUTER
// ═══════════════════════════════════════════════════════════════════════════════
const server = http.createServer(async (req, res) => {
  const startTime = Date.now();
  if (req.method === 'OPTIONS') return send(res, 200, { ok: true });

  const parsed   = url.parse(req.url || '/', true);
  const pathname = parsed.pathname.replace(/\/$/, '') || '/';
  const method   = req.method.toUpperCase();

  // Request logging
  log('INFO', `${method} ${pathname}`, { ip: req.socket?.remoteAddress });

  try {
    await route(req, res, pathname, method, parsed.query);
  } catch (e) {
    log('ERROR', 'Unhandled request error', { error: e.message, stack: e.stack?.slice(0, 300) });
    err(res, 500, 'Internal server error');
  }

  const dur = Date.now() - startTime;
  if (dur > 1000) log('WARN', `Slow request: ${method} ${pathname} took ${dur}ms`);
});

async function route(req, res, pathname, method, query) {

  // ── PUBLIC: Health check ──────────────────────────────────────────────────
  if (pathname === '/health' && method === 'GET') {
    const serverData = getServerData();
    return send(res, 200, {
      ok: true,
      version: '2.0.0',
      uptime: Math.floor(process.uptime()),
      ts: new Date().toISOString(),
      db: db ? 'sqlite' : 'flat-file',
      syncVersion: serverData.version,
      lastSync: serverData.updatedAt,
      waEnabled: !!(WA_TOKEN && WA_PHONE_ID),
      nodeVersion: process.version,
      memory: Math.floor(process.memoryUsage().rss / 1024 / 1024) + 'MB',
    });
  }

  // ── PUBLIC: Login ─────────────────────────────────────────────────────────
  if (pathname === '/auth/login' && method === 'POST') {
    const { username, password } = await body(req);
    if (!username || !password) return err(res, 400, 'Username and password required');

    const user = getUserByUsername(username);
    if (!user || !user.active) return err(res, 401, 'Invalid credentials');

    const valid = verifyPassword(password, user.pass_hash, user.pass_salt);
    if (!valid) {
      logAudit(user.id, 'LOGIN_FAILED', { username });
      return err(res, 401, 'Invalid credentials');
    }

    const token = issueToken(user.id, user.role);
    logAudit(user.id, 'LOGIN_SUCCESS', { username });
    log('INFO', `Login: ${username} (${user.role})`);
    return send(res, 200, {
      ok: true,
      token,
      user: { id: user.id, username: user.username, name: user.name, avatar: user.avatar, role: user.role, color: user.color }
    });
  }

  // ── AUTH REQUIRED below ───────────────────────────────────────────────────
  const authUser = requireAuth(req);
  if (!authUser) return err(res, 401, 'Authentication required');

  // ── GET /auth/me ──────────────────────────────────────────────────────────
  if (pathname === '/auth/me' && method === 'GET') {
    return send(res, 200, { ok: true, user: {
      id: authUser.id, username: authUser.username, name: authUser.name,
      avatar: authUser.avatar, role: authUser.role, color: authUser.color, active: authUser.active
    }});
  }

  // ── POST /auth/change-password ────────────────────────────────────────────
  if (pathname === '/auth/change-password' && method === 'POST') {
    const { currentPassword, newPassword } = await body(req);
    if (!currentPassword || !newPassword) return err(res, 400, 'Both passwords required');
    if (newPassword.length < 6) return err(res, 400, 'New password min 6 characters');

    const user = getUserById(authUser.id);
    if (!verifyPassword(currentPassword, user.pass_hash, user.pass_salt))
      return err(res, 401, 'Current password incorrect');

    const { hash, salt } = hashPassword(newPassword);
    if (db) {
      db.prepare("UPDATE users SET pass_hash=?, pass_salt=?, updated_at=datetime('now') WHERE id=?")
        .run(hash, salt, authUser.id);
    } else {
      const u = DB_STORE.users.find(u => u.id === authUser.id);
      if (u) { u.pass_hash = hash; u.pass_salt = salt; saveFlat(); }
    }
    logAudit(authUser.id, 'PASSWORD_CHANGED');
    return send(res, 200, { ok: true });
  }

  // ── GET /sync ─────────────────────────────────────────────────────────────
  if (pathname === '/sync' && method === 'GET') {
    const serverData = getServerData();
    logSync(authUser.id, 'pull', 'ok', serverData.payload ? JSON.stringify(serverData.payload).length : 0);
    return send(res, 200, {
      ok: true,
      payload: serverData.payload,
      version: serverData.version,
      updatedAt: serverData.updatedAt,
      updatedBy: serverData.updatedBy,
    });
  }

  // ── POST /sync ────────────────────────────────────────────────────────────
  if (pathname === '/sync' && method === 'POST') {
    if (!canEdit(authUser)) return err(res, 403, 'Editor or Admin role required to push data');

    let incoming;
    try { incoming = await body(req); } catch { return err(res, 400, 'Invalid JSON body'); }
    if (!incoming || typeof incoming !== 'object') return err(res, 400, 'Invalid request body');

    const { payload, clientVersion, force } = incoming;
    if (!payload) return err(res, 400, 'payload field required');
    if (typeof payload !== 'object') return err(res, 400, 'payload must be an object');

    // Sanity check on payload size (max 20MB)
    const payloadStr = JSON.stringify(payload);
    if (payloadStr.length > 20 * 1024 * 1024) {
      return err(res, 413, 'Payload too large (max 20MB)');
    }

    const serverData = getServerData();
    const sv = serverData.version || 0;
    const cv = Number(clientVersion) || 0;

    // Conflict detection: server has newer data than client expects
    if (!force && sv > 0 && cv > 0 && sv > cv + 1) {
      logSync(authUser.id, 'push', 'conflict', 0, `server v${sv} > client v${cv}`);
      return send(res, 409, {
        ok: false,
        conflict: true,
        error: `Conflict: server is at version ${sv}, client sent version ${cv}`,
        serverVersion: sv,
        clientVersion: cv,
        hint: 'Pull server data first, merge locally, then push again with force:true',
      });
    }

    const newVersion = saveServerData(payload, authUser.id);
    const bytes = JSON.stringify(payload).length;
    logSync(authUser.id, 'push', 'ok', bytes, `v${sv}→v${newVersion}`);
    logAudit(authUser.id, 'DATA_PUSH', { version: newVersion, bytes });

    return send(res, 200, {
      ok: true,
      version: newVersion,
      serverSavedAt: new Date().toISOString(),
      bytes,
    });
  }

  // ── GET /sync/status ──────────────────────────────────────────────────────
  if (pathname === '/sync/status' && method === 'GET') {
    const serverData = getServerData();
    const syncLogs = db
      ? db.prepare('SELECT * FROM sync_log ORDER BY id DESC LIMIT 20').all()
      : (DB_STORE.syncLog || []).slice(-20).reverse();
    return send(res, 200, {
      ok: true,
      serverVersion: serverData.version,
      lastUpdated: serverData.updatedAt,
      lastUpdatedBy: serverData.updatedBy,
      recentSyncs: syncLogs,
    });
  }

  // ── USER MANAGEMENT (admin only) ──────────────────────────────────────────
  if (pathname === '/users' && method === 'GET') {
    if (!isAdmin(authUser)) return err(res, 403, 'Admin required');
    return send(res, 200, { ok: true, users: getAllUsers() });
  }

  if (pathname === '/users' && method === 'POST') {
    if (!isAdmin(authUser)) return err(res, 403, 'Admin required');
    const { username, name, password, role, color, avatar } = await body(req);
    if (!username || !name || !password) return err(res, 400, 'username, name, password required');
    if (username.length < 2 || username.length > 50) return err(res, 400, 'Username must be 2-50 chars');
    if (name.length < 1 || name.length > 100) return err(res, 400, 'Name must be 1-100 chars');
    if (password.length < 6) return err(res, 400, 'Password min 6 characters');
    if (password.length > 128) return err(res, 400, 'Password max 128 characters');
    if (!['admin','editor','viewer'].includes(role)) return err(res, 400, 'Invalid role (admin|editor|viewer)');
    // Validate username format: alphanumeric + underscore only
    if (!/^[a-z0-9_]{2,50}$/.test(username.toLowerCase())) {
      return err(res, 400, 'Username: only lowercase letters, digits, underscores (2-50 chars)');
    }
    if (getUserByUsername(username)) return err(res, 409, 'Username already exists');

    const { hash, salt } = hashPassword(password);
    const id = 'u_' + Date.now();
    if (db) {
      db.prepare('INSERT INTO users(id,username,name,avatar,role,pass_hash,pass_salt,color) VALUES(?,?,?,?,?,?,?,?)')
        .run(id, username.toLowerCase(), name, avatar || name[0].toUpperCase(), role || 'viewer', hash, salt, color || '#3b82f6');
    } else {
      DB_STORE.users.push({ id, username: username.toLowerCase(), name, avatar: avatar || name[0].toUpperCase(),
        role: role || 'viewer', pass_hash: hash, pass_salt: salt, color: color || '#3b82f6',
        active: true, created_at: new Date().toISOString() });
      saveFlat();
    }
    logAudit(authUser.id, 'USER_CREATED', { username, role });
    return send(res, 201, { ok: true, id });
  }

  // ── PUT /users/:id ────────────────────────────────────────────────────────
  const userEditMatch = pathname.match(/^\/users\/([^/]+)$/);
  if (userEditMatch && method === 'PUT') {
    if (!isAdmin(authUser)) return err(res, 403, 'Admin required');
    const targetId = userEditMatch[1];
    const { name, role, color, avatar, active } = await body(req);
    if (db) {
      db.prepare(`UPDATE users SET name=COALESCE(?,name), role=COALESCE(?,role),
        color=COALESCE(?,color), avatar=COALESCE(?,avatar),
        active=COALESCE(?,active), updated_at=datetime('now') WHERE id=?`)
        .run(name, role, color, avatar, active !== undefined ? (active ? 1 : 0) : null, targetId);
    } else {
      const u = DB_STORE.users.find(u => u.id === targetId);
      if (!u) return err(res, 404, 'User not found');
      if (name)   u.name   = name;
      if (role)   u.role   = role;
      if (color)  u.color  = color;
      if (avatar) u.avatar = avatar;
      if (active !== undefined) u.active = active;
      saveFlat();
    }
    logAudit(authUser.id, 'USER_UPDATED', { targetId, changes: { name, role, active } });
    return send(res, 200, { ok: true });
  }

  // ── POST /users/:id/reset-password ────────────────────────────────────────
  const resetMatch = pathname.match(/^\/users\/([^/]+)\/reset-password$/);
  if (resetMatch && method === 'POST') {
    if (!isAdmin(authUser)) return err(res, 403, 'Admin required');
    const targetId = resetMatch[1];
    const { newPassword } = await body(req);
    if (!newPassword || newPassword.length < 6) return err(res, 400, 'New password min 6 characters');
    const { hash, salt } = hashPassword(newPassword);
    if (db) {
      db.prepare("UPDATE users SET pass_hash=?, pass_salt=?, updated_at=datetime('now') WHERE id=?")
        .run(hash, salt, targetId);
    } else {
      const u = DB_STORE.users.find(u => u.id === targetId);
      if (!u) return err(res, 404, 'User not found');
      u.pass_hash = hash; u.pass_salt = salt;
      saveFlat();
    }
    logAudit(authUser.id, 'USER_PASSWORD_RESET', { targetId });
    return send(res, 200, { ok: true });
  }

  // ── DELETE /users/:id ─────────────────────────────────────────────────────
  if (userEditMatch && method === 'DELETE') {
    if (!isAdmin(authUser)) return err(res, 403, 'Admin required');
    const targetId = userEditMatch[1];
    if (targetId === authUser.id) return err(res, 400, 'Cannot delete yourself');
    if (db) {
      db.prepare("UPDATE users SET active=0, updated_at=datetime('now') WHERE id=?").run(targetId);
    } else {
      const u = DB_STORE.users.find(u => u.id === targetId);
      if (u) { u.active = false; saveFlat(); }
    }
    logAudit(authUser.id, 'USER_DEACTIVATED', { targetId });
    return send(res, 200, { ok: true });
  }

  // ── GET /audit ─────────────────────────────────────────────────────────────
  if (pathname === '/audit' && method === 'GET') {
    if (!isAdmin(authUser)) return err(res, 403, 'Admin required');
    const limit = Math.min(Number(query.limit) || 100, 1000);
    const logs = db
      ? db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?').all(limit)
      : (DB_STORE.auditLog || []).slice(-limit).reverse();
    return send(res, 200, { ok: true, logs });
  }

  // ── GET /wa-log ────────────────────────────────────────────────────────────
  if (pathname === '/wa-log' && method === 'GET') {
    const logs = db
      ? db.prepare('SELECT * FROM wa_log ORDER BY id DESC LIMIT 200').all()
      : (DB_STORE.waLog || []).slice(-200).reverse();
    return send(res, 200, { ok: true, logs });
  }

  // ── POST /wa-send (manual trigger) ────────────────────────────────────────
  if (pathname === '/wa-send' && method === 'POST') {
    if (!canEdit(authUser)) return err(res, 403, 'Editor required');
    const { phone, message } = await body(req);
    if (!phone || !message) return err(res, 400, 'phone and message required');
    try {
      const result = await sendWA(phone, message);
      logAudit(authUser.id, 'WA_MANUAL_SEND', { phone });
      return send(res, 200, { ok: true, result });
    } catch(e) {
      return err(res, 500, 'WA send failed', e.message);
    }
  }

  // ── GET /logs ──────────────────────────────────────────────────────────────
  if (pathname === '/logs' && method === 'GET') {
    if (!isAdmin(authUser)) return err(res, 403, 'Admin required');
    const limit = Number(query.limit) || 200;
    const logs = db
      ? db.prepare('SELECT * FROM sync_log ORDER BY id DESC LIMIT ?').all(limit)
      : (DB_STORE.syncLog || []).slice(-limit).reverse();
    return send(res, 200, { ok: true, logs });
  }

  // ── GET /backups ───────────────────────────────────────────────────────────
  if (pathname === '/backups' && method === 'GET') {
    if (!isAdmin(authUser)) return err(res, 403, 'Admin required');
    const files = fs.existsSync(BACKUP_DIR)
      ? fs.readdirSync(BACKUP_DIR).filter(f => f.startsWith('server-backup-'))
          .map(f => ({ name: f, size: fs.statSync(path.join(BACKUP_DIR, f)).size,
            mtime: fs.statSync(path.join(BACKUP_DIR, f)).mtime.toISOString() }))
          .sort((a,b) => b.mtime.localeCompare(a.mtime))
      : [];
    return send(res, 200, { ok: true, backups: files });
  }

  // ── 404 ────────────────────────────────────────────────────────────────────
  return err(res, 404, 'Not found', `${method} ${pathname}`);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function generateDefaultSecret() {
  return 'ktp_dev_' + crypto.randomBytes(16).toString('hex');
}

// ── Start ─────────────────────────────────────────────────────────────────────
tryLoadSQLite();

server.listen(PORT, () => {
  log('INFO', `\n🏢 Kira Takip Pro Server v2.0`);
  log('INFO', `   URL:       http://localhost:${PORT}`);
  log('INFO', `   DB:        ${db ? `SQLite (${DB_PATH})` : `Flat-file (${FLAT_PATH})`}`);
  log('INFO', `   Backups:   ${BACKUP_DIR}`);
  log('INFO', `   WA:        ${WA_TOKEN ? '✅ Configured' : '⚠️  Not configured'}`);
  log('INFO', `   Mode:      ${IS_DEV ? 'development' : 'production'}`);
  log('INFO', `   Secret:    ${process.env.KTP_SECRET ? '✅ From env' : '⚠️  Auto-generated (set KTP_SECRET!)'}`);
  log('INFO', `\nEndpoints:`);
  log('INFO', `   POST /auth/login          → login (returns token)`);
  log('INFO', `   GET  /auth/me             → current user info`);
  log('INFO', `   POST /auth/change-password → change own password`);
  log('INFO', `   GET  /sync                → pull data`);
  log('INFO', `   POST /sync                → push data`);
  log('INFO', `   GET  /sync/status         → sync version + recent logs`);
  log('INFO', `   GET  /users               → list users (admin)`);
  log('INFO', `   POST /users               → create user (admin)`);
  log('INFO', `   PUT  /users/:id           → edit user (admin)`);
  log('INFO', `   POST /users/:id/reset-password → reset password (admin)`);
  log('INFO', `   DELETE /users/:id         → deactivate user (admin)`);
  log('INFO', `   GET  /audit               → audit log (admin)`);
  log('INFO', `   GET  /logs                → sync logs (admin)`);
  log('INFO', `   GET  /backups             → backup list (admin)`);
  log('INFO', `   GET  /health              → server status (public)`);
  log('INFO', `   POST /wa-send             → manual WA send`);
  log('INFO', `   GET  /wa-log              → WA reminder log\n`);
});

// Auto backup every 5 minutes
setInterval(autoBackup, 5 * 60 * 1000);

// WA reminder worker every 5 minutes
if (WA_TOKEN) setInterval(waReminderWorker, 5 * 60 * 1000);

// Cleanup expired sessions every hour
setInterval(() => {
  if (!db) return;
  try { db.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')").run(); } catch {}
}, 60 * 60 * 1000);

process.on('SIGTERM', () => {
  log('INFO', 'SIGTERM received, shutting down...');
  autoBackup();
  if (db) db.close();
  server.close(() => process.exit(0));
});
process.on('uncaughtException', (err) => { log('ERROR', 'Uncaught exception', { err: err.message }); });
process.on('unhandledRejection', (reason) => { log('ERROR', 'Unhandled rejection', { reason: String(reason) }); });
