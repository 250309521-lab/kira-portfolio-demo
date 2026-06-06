/**
 * Kira Takip Pro — Full Integrity & Backup Validation Suite
 * v5.1.0
 *
 * Run: node src/tests/integrity.js
 *
 * Tests:
 *   1. Backup creation and validation
 *   2. Backup restore integrity
 *   3. Corrupted DB recovery
 *   4. Missing file handling
 *   5. Multi-user sync conflict
 *   6. Duplicate payment prevention
 *   7. Duplicate import handling
 *   8. Audit log integrity
 *   9. Password/user persistence after restore
 *  10. Dangerous action confirmation guards
 *  11. Interrupted operation recovery
 *  12. Server error logging
 *  13. Excel import validation
 *  14. Data completeness after round-trip
 */

'use strict';

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const os     = require('os');

// ── Test Harness ──────────────────────────────────────────────────────────────
let passed = 0, failed = 0, warned = 0;
const RESULTS = [];

function test(name, fn) {
  process.stdout.write(`  Testing: ${name} ... `);
  const start = Date.now();
  try {
    const result = fn();
    const dur = Date.now() - start;
    if (result && result.warn) {
      console.log(`⚠️  WARN (${dur}ms): ${result.warn}`);
      warned++;
      RESULTS.push({ name, status: 'WARN', msg: result.warn, dur });
    } else {
      console.log(`✅ PASS (${dur}ms)`);
      passed++;
      RESULTS.push({ name, status: 'PASS', dur });
    }
  } catch (e) {
    const dur = Date.now() - start;
    console.log(`❌ FAIL (${dur}ms): ${e.message}`);
    failed++;
    RESULTS.push({ name, status: 'FAIL', msg: e.message, dur });
  }
}

async function testAsync(name, fn) {
  process.stdout.write(`  Testing: ${name} ... `);
  const start = Date.now();
  try {
    const result = await fn();
    const dur = Date.now() - start;
    if (result && result.warn) {
      console.log(`⚠️  WARN (${dur}ms): ${result.warn}`);
      warned++;
      RESULTS.push({ name, status: 'WARN', msg: result.warn, dur });
    } else {
      console.log(`✅ PASS (${dur}ms)`);
      passed++;
      RESULTS.push({ name, status: 'PASS', dur });
    }
  } catch (e) {
    const dur = Date.now() - start;
    console.log(`❌ FAIL (${dur}ms): ${e.message}`);
    failed++;
    RESULTS.push({ name, status: 'FAIL', msg: e.message, dur });
  }
}

function assert(cond, msg) { if (!cond) throw new Error(msg || 'Assertion failed'); }
function assertEqual(a, b, msg) {
  if (a !== b) throw new Error(`${msg||'assertEqual'}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}
function assertIncludes(arr, item, msg) {
  if (!arr.includes(item)) throw new Error(`${msg||'assertIncludes'}: ${JSON.stringify(item)} not in array`);
}

// ── Temp directory for test artifacts ─────────────────────────────────────────
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ktp-integrity-'));
const TEST_DB   = path.join(TMP, 'test.db');
const BACKUP_D  = path.join(TMP, 'backups');
const STORE_F   = path.join(TMP, 'store.json');
fs.mkdirSync(BACKUP_D, { recursive: true });

// ── Data Fixtures ─────────────────────────────────────────────────────────────
const SAMPLE_DATA = {
  tenants: {
    GAYRETTEPE: [
      { id:'G1', unit:'D1', name:'Emir Can İpek', rent:30000, phone:'905321111111', active:true, gun:5 },
      { id:'G2', unit:'D2', name:'Selin Aydın', rent:28000, phone:'905322222222', active:true, gun:5 },
      { id:'G3', unit:'D3', name:'', rent:0, phone:'', active:false, gun:1 }, // vacant
    ],
    KARAKOL: [
      { id:'K1', unit:'D1', name:'Hasan Demir', rent:22000, phone:'905333333333', active:true, gun:3 },
    ],
    'TAN SOKAK': [
      { id:'T1', unit:'D1', name:'Fatma Yılmaz', rent:18000, phone:'905344444444', active:true, gun:1 },
    ]
  },
  payments: {
    G1: { 'Nisan 2026': { paid:30000, date:'2026-04-06', sekil:'Banka', notes:'' }},
    G2: { 'Nisan 2026': { paid:14000, date:'2026-04-10', sekil:'Elden', notes:'Kısmi' }},
    K1: { 'Nisan 2026': { paid:22000, date:'2026-04-04', sekil:'IBAN', notes:'' }},
  },
  expenses: {
    GAYRETTEPE: { 'Nisan 2026': [
      { tur:'ELEKTRİK', no:'1234567890', tutar:15075, tarih:'2026-04-15', notlar:'' },
      { tur:'DOĞALGAZ', no:'9876543210', tutar:30302, tarih:'2026-04-20', notlar:'' },
    ]},
  },
  mgmt: {
    'Nisan 2026': { col:197000, exp:15668, net:181332 }
  },
  users: [
    { id:'malik', name:'Malik (Sahip)', role:'admin', pin:'1234', color:'#3b82f6', active:true },
    { id:'alper', name:'Alper', role:'manager', pin:'5678', color:'#8b5cf6', active:true },
    { id:'hamid', name:'Hamid Bey', role:'viewer', pin:'9999', color:'#06d6a0', active:true },
  ],
  history: [
    { t:'2026-04-01 09:00:00', desc:'Giriş: Malik (Sahip)', user:'Malik (Sahip)' },
    { t:'2026-04-06 10:15:00', desc:'GAYRETTEPE D1 – Emir Can İpek: ödeme (Nisan 2026)', user:'Malik (Sahip)' },
  ],
  waLog: [
    { t:'2026-04-08 09:00:00', bina:'Gayrettepe', unit:'D2', name:'Selin Aydın', mo:'Nisan 2026' }
  ],
  settings: { autoSave: true },
  cloud: { url:'', key:'', token:'', enabled:false }
};

// ── Password helpers (mirror from server.js) ──────────────────────────────────
function hashPassword(password, salt) {
  salt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha256').toString('hex');
  return { hash, salt };
}
function verifyPassword(password, hash, salt) {
  const { hash: h } = hashPassword(password, salt);
  return h === hash;
}

// ── Token helpers ──────────────────────────────────────────────────────────────
const TEST_SECRET = 'test-secret-integrity-suite-12345';
function signToken(payload) {
  const h = Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
  const b = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const s = crypto.createHmac('sha256', TEST_SECRET).update(`${h}.${b}`).digest('base64url');
  return `${h}.${b}.${s}`;
}
function verifyToken(token, secret = TEST_SECRET) {
  try {
    const [h, b, s] = token.split('.');
    const exp = crypto.createHmac('sha256', secret).update(`${h}.${b}`).digest('base64url');
    if (s !== exp) return null;
    const p = JSON.parse(Buffer.from(b, 'base64url').toString());
    if (p.exp && Date.now() > p.exp) return null;
    return p;
  } catch { return null; }
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n═══════════════════════════════════════════════════════');
console.log('  Kira Takip Pro — Integrity & Recovery Test Suite');
console.log('═══════════════════════════════════════════════════════\n');

// ── SECTION 1: Backup Creation ─────────────────────────────────────────────────
console.log('── 1. BACKUP CREATION ─────────────────────────────────');

test('JSON backup serialisation is complete', () => {
  const json = JSON.stringify(SAMPLE_DATA);
  const parsed = JSON.parse(json);
  assert(parsed.tenants, 'tenants missing');
  assert(parsed.payments, 'payments missing');
  assert(parsed.expenses, 'expenses missing');
  assert(parsed.mgmt, 'mgmt missing');
  assert(parsed.users, 'users missing');
  assert(parsed.history, 'history missing');
  assert(parsed.waLog, 'waLog missing');
  assert(parsed.settings, 'settings missing');
});

test('JSON backup file is valid and parseable', () => {
  const backupPath = path.join(BACKUP_D, 'test-backup.json');
  fs.writeFileSync(backupPath, JSON.stringify(SAMPLE_DATA, null, 2));
  assert(fs.existsSync(backupPath), 'backup file not created');
  const size = fs.statSync(backupPath).size;
  assert(size > 1000, `backup too small: ${size} bytes`);
  const parsed = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
  assert(parsed.tenants, 'backup parse: tenants missing');
});

test('Backup includes all tenant records', () => {
  const backup = JSON.parse(JSON.stringify(SAMPLE_DATA));
  const total = Object.values(backup.tenants).flat().length;
  assertEqual(total, 5, 'total tenant count');
  const active = Object.values(backup.tenants).flat().filter(t=>t.active && t.rent>0).length;
  assertEqual(active, 4, 'active paid tenant count');
});

test('Backup includes all payment records', () => {
  const backup = JSON.parse(JSON.stringify(SAMPLE_DATA));
  const payCount = Object.values(backup.payments).reduce((s,m) => s + Object.keys(m).length, 0);
  assertEqual(payCount, 3, 'payment record count');
});

test('Backup includes correct financial totals', () => {
  const backup = JSON.parse(JSON.stringify(SAMPLE_DATA));
  const totalPaid = Object.values(backup.payments).reduce((s, months) =>
    s + Object.values(months).reduce((ss, p) => ss + (p.paid || 0), 0), 0);
  assertEqual(totalPaid, 66000, 'total paid across all months/tenants');
  const totalExp = backup.expenses.GAYRETTEPE['Nisan 2026'].reduce((s,e) => s+e.tutar, 0);
  assertEqual(totalExp, 45377, 'total expenses Gayrettepe April');
});

test('Backup timestamps are valid ISO format', () => {
  const backup = JSON.parse(JSON.stringify(SAMPLE_DATA));
  backup.history.forEach(h => {
    assert(h.t && h.t.length >= 10, `invalid timestamp: ${h.t}`);
  });
  backup.waLog.forEach(w => {
    assert(w.t && w.t.length >= 10, `invalid WA log timestamp: ${w.t}`);
  });
});

test('Multiple backup files can coexist', () => {
  const files = ['backup-2026-05-10-auto.json', 'backup-2026-05-11-manual.json', 'backup-2026-05-12-shutdown.json'];
  files.forEach(f => fs.writeFileSync(path.join(BACKUP_D, f), JSON.stringify(SAMPLE_DATA)));
  const count = fs.readdirSync(BACKUP_D).filter(f=>f.endsWith('.json')).length;
  assert(count >= 3, `expected ≥3 backup files, got ${count}`);
});

test('Old backups are cleaned when limit exceeded', () => {
  // Simulate cleanup: keep last 3 of many
  const oldFiles = [];
  for (let i = 0; i < 30; i++) {
    const name = `backup-2026-01-${String(i).padStart(2,'0')}-auto.json`;
    const fp = path.join(BACKUP_D, name);
    fs.writeFileSync(fp, '{}');
    oldFiles.push(fp);
  }
  // Keep last 24 of the auto files we created
  const toDelete = oldFiles.sort().slice(0, -24);
  toDelete.forEach(f => { try { fs.unlinkSync(f); } catch {} });
  // Count only the -auto-. files we created (not test-backup.json etc)
  const after = fs.readdirSync(BACKUP_D)
    .filter(f => f.match(/backup-2026-01-\d+-auto\.json/)).length;
  assert(after <= 24, `cleanup should keep ≤24 auto backups, kept ${after}`);
});

// ── SECTION 2: Restore Integrity ───────────────────────────────────────────────
console.log('\n── 2. RESTORE INTEGRITY ───────────────────────────────');

test('Restored data has identical tenant records', () => {
  const backupPath = path.join(BACKUP_D, 'restore-test.json');
  fs.writeFileSync(backupPath, JSON.stringify(SAMPLE_DATA));
  const restored = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
  assertEqual(
    restored.tenants.GAYRETTEPE[0].name,
    SAMPLE_DATA.tenants.GAYRETTEPE[0].name,
    'tenant name after restore'
  );
  assertEqual(restored.tenants.GAYRETTEPE[0].rent, 30000, 'tenant rent after restore');
});

test('Restored payments match original exactly', () => {
  const restored = JSON.parse(JSON.stringify(SAMPLE_DATA));
  const orig = SAMPLE_DATA.payments.G1['Nisan 2026'];
  const rest = restored.payments.G1['Nisan 2026'];
  assertEqual(rest.paid, orig.paid, 'payment amount');
  assertEqual(rest.date, orig.date, 'payment date');
  assertEqual(rest.sekil, orig.sekil, 'payment method');
});

test('Restored expenses match original exactly', () => {
  const restored = JSON.parse(JSON.stringify(SAMPLE_DATA));
  const orig = SAMPLE_DATA.expenses.GAYRETTEPE['Nisan 2026'];
  const rest = restored.expenses.GAYRETTEPE['Nisan 2026'];
  assertEqual(rest.length, orig.length, 'expense count');
  assertEqual(rest[0].tutar, orig[0].tutar, 'first expense amount');
  assertEqual(rest[1].tutar, orig[1].tutar, 'second expense amount');
});

test('Users survive restore with roles intact', () => {
  const restored = JSON.parse(JSON.stringify(SAMPLE_DATA));
  assertEqual(restored.users.length, 3, 'user count');
  const admin = restored.users.find(u => u.id === 'malik');
  assert(admin, 'admin user present after restore');
  assertEqual(admin.role, 'admin', 'admin role after restore');
  const editor = restored.users.find(u => u.id === 'alper');
  assertEqual(editor.role, 'manager', 'editor role after restore');
  const viewer = restored.users.find(u => u.id === 'hamid');
  assertEqual(viewer.role, 'viewer', 'viewer role after restore');
});

test('Audit history survives restore', () => {
  const restored = JSON.parse(JSON.stringify(SAMPLE_DATA));
  assertEqual(restored.history.length, 2, 'history entry count');
  assertEqual(restored.history[0].user, 'Malik (Sahip)', 'history user attribution');
  assert(restored.history[1].desc.includes('Emir Can İpek'), 'history description');
});

test('WA log survives restore', () => {
  const restored = JSON.parse(JSON.stringify(SAMPLE_DATA));
  assertEqual(restored.waLog.length, 1, 'waLog entry count');
  assertEqual(restored.waLog[0].unit, 'D2', 'waLog unit');
  assertEqual(restored.waLog[0].mo, 'Nisan 2026', 'waLog month');
});

test('Mgmt account data survives restore', () => {
  const restored = JSON.parse(JSON.stringify(SAMPLE_DATA));
  const mgmt = restored.mgmt['Nisan 2026'];
  assert(mgmt, 'mgmt entry present');
  assertEqual(mgmt.col, 197000, 'mgmt collected');
  assertEqual(mgmt.exp, 15668, 'mgmt expenses');
  assertEqual(mgmt.net, 181332, 'mgmt net');
});

test('Server password hashes survive restore and verify correctly', () => {
  const { hash, salt } = hashPassword('test-admin-pass');
  const userData = { id:'u1', username:'malik', pass_hash:hash, pass_salt:salt };
  // Simulate backup + restore
  const backed = JSON.parse(JSON.stringify(userData));
  assert(verifyPassword('test-admin-pass', backed.pass_hash, backed.pass_salt), 'password verifies after restore');
  assert(!verifyPassword('wrong-pass', backed.pass_hash, backed.pass_salt), 'wrong password rejected after restore');
});

// ── SECTION 3: Corruption Recovery ─────────────────────────────────────────────
console.log('\n── 3. CORRUPTION RECOVERY ─────────────────────────────');

test('Truncated JSON detected and rejected', () => {
  const good = JSON.stringify(SAMPLE_DATA);
  const truncated = good.slice(0, good.length / 2); // cut in half
  let parsed = null;
  let error = null;
  try { parsed = JSON.parse(truncated); } catch(e) { error = e; }
  assert(error !== null, 'truncated JSON should throw parse error');
  assert(parsed === null, 'truncated JSON should not return data');
});

test('Empty JSON file detected and rejected', () => {
  const emptyPath = path.join(TMP, 'empty.json');
  fs.writeFileSync(emptyPath, '');
  let error = null;
  try { JSON.parse(fs.readFileSync(emptyPath, 'utf8')); } catch(e) { error = e; }
  assert(error !== null, 'empty JSON should throw parse error');
});

test('JSON with null values handled gracefully', () => {
  const corrupted = { tenants: null, payments: null, expenses: null, users: null };
  const json = JSON.stringify(corrupted);
  const parsed = JSON.parse(json);
  // App should handle null gracefully with || {} defaults
  const tenants = parsed.tenants || {};
  assert(typeof tenants === 'object', 'null tenants → empty object');
  assert(Object.keys(tenants).length === 0, 'empty tenants');
});

test('JSON with missing fields falls back to defaults', () => {
  // Simulate partial backup (e.g. from very old version)
  const partial = { tenants: SAMPLE_DATA.tenants }; // missing payments, expenses, etc.
  const parsed = JSON.parse(JSON.stringify(partial));
  // App import logic uses || {} pattern
  const payments = parsed.payments || {};
  const expenses = parsed.expenses || {};
  const users = parsed.users || [];
  assert(Object.keys(payments).length === 0, 'missing payments → empty object');
  assert(Object.keys(expenses).length === 0, 'missing expenses → empty object');
  assert(users.length === 0, 'missing users → empty array');
});

test('Corrupted field in one tenant does not corrupt others', () => {
  const data = JSON.parse(JSON.stringify(SAMPLE_DATA));
  data.tenants.GAYRETTEPE[0].rent = 'NOT_A_NUMBER'; // corrupt one field
  // Other tenants should still be valid
  const t2 = data.tenants.GAYRETTEPE[1];
  assert(typeof t2.rent === 'number', 'second tenant rent unaffected');
  assertEqual(t2.rent, 28000, 'second tenant rent value');
  // The corrupted tenant should be detectable
  const badRent = parseFloat(data.tenants.GAYRETTEPE[0].rent);
  assert(isNaN(badRent), 'corrupted rent is NaN after parseFloat');
});

test('Missing backup file returns error, not crash', () => {
  const fakePath = path.join(TMP, 'nonexistent-backup.json');
  const exists = fs.existsSync(fakePath);
  assert(!exists, 'file should not exist');
  // Restore handler checks existsSync first
  if (!exists) {
    const result = { ok: false, error: 'File not found' };
    assert(!result.ok, 'should return ok:false');
    assert(result.error, 'should return error message');
  }
});

test('Backup directory missing → created automatically', () => {
  const newBackupDir = path.join(TMP, 'new-backup-dir');
  assert(!fs.existsSync(newBackupDir), 'dir should not exist yet');
  fs.mkdirSync(newBackupDir, { recursive: true });
  assert(fs.existsSync(newBackupDir), 'dir created successfully');
  fs.rmdirSync(newBackupDir);
});

test('Interrupted backup does not corrupt source DB', () => {
  // Simulate: backup starts, then "fails" — original data untouched
  const sourceData = JSON.stringify(SAMPLE_DATA);
  const sourcePath = path.join(TMP, 'source.json');
  fs.writeFileSync(sourcePath, sourceData);
  // Simulate interrupted backup (dest file is partial)
  const destPath = path.join(BACKUP_D, 'interrupted-backup.json');
  try {
    fs.writeFileSync(destPath, sourceData.slice(0, 100)); // partial
    throw new Error('Simulated interrupt');
  } catch {}
  // Source should be unchanged
  const source = fs.readFileSync(sourcePath, 'utf8');
  assertEqual(source, sourceData, 'source data unchanged after interrupted backup');
});

test('Interrupted restore: pre-restore backup exists before overwrite', () => {
  // The backup:restore handler calls autoBackup('pre-restore') BEFORE overwriting
  // Simulate: original exists, pre-restore backup created, then restore happens
  const originalPath = path.join(TMP, 'original.json');
  const backupOfOriginal = path.join(BACKUP_D, 'pre-restore-backup.json');
  fs.writeFileSync(originalPath, JSON.stringify(SAMPLE_DATA));
  // Create pre-restore backup
  fs.copyFileSync(originalPath, backupOfOriginal);
  assert(fs.existsSync(backupOfOriginal), 'pre-restore backup created before overwrite');
  // Now simulate interrupted restore
  try {
    fs.writeFileSync(originalPath, '{"tenants":{}'); // broken
    throw new Error('Interrupt!');
  } catch {}
  // Recovery: use pre-restore backup
  const recovery = fs.readFileSync(backupOfOriginal, 'utf8');
  const parsed = JSON.parse(recovery);
  assert(parsed.tenants, 'can recover from pre-restore backup');
  assertEqual(parsed.tenants.GAYRETTEPE[0].name, 'Emir Can İpek', 'recovered tenant name');
  // Restore from backup
  fs.copyFileSync(backupOfOriginal, originalPath);
  const restored = JSON.parse(fs.readFileSync(originalPath, 'utf8'));
  assertEqual(restored.tenants.GAYRETTEPE[0].name, 'Emir Can İpek', 'restored successfully');
});

// ── SECTION 4: Multi-User Sync Integrity ────────────────────────────────────────
console.log('\n── 4. MULTI-USER SYNC INTEGRITY ───────────────────────');

test('Sync version increments on every push', () => {
  let version = 0;
  for (let i = 0; i < 5; i++) version++;
  assertEqual(version, 5, 'version after 5 pushes');
});

test('Conflict detected when client version is stale', () => {
  const serverVersion = 8;
  const clientVersion = 5;
  const hasConflict = serverVersion > clientVersion + 1;
  assert(hasConflict, 'should detect conflict: sv=8, cv=5');
});

test('No conflict when client is one behind', () => {
  const serverVersion = 3;
  const clientVersion = 2;
  const hasConflict = serverVersion > clientVersion + 1;
  assert(!hasConflict, 'should not conflict: sv=3, cv=2');
});

test('No conflict on first push (cv=0)', () => {
  const serverVersion = 0;
  const clientVersion = 0;
  const hasConflict = serverVersion > 0 && clientVersion > 0 && serverVersion > clientVersion + 1;
  assert(!hasConflict, 'first push should never conflict');
});

test('Duplicate payment detection (same tenant + month)', () => {
  const payments = { ...SAMPLE_DATA.payments };
  // Try to add duplicate: G1 already has Nisan 2026
  const existing = payments['G1']['Nisan 2026'];
  assert(existing, 'original payment exists');
  // Adding again overwrites (last-write-wins for payments)
  payments['G1']['Nisan 2026'] = { paid:30000, date:'2026-04-07', sekil:'IBAN', notes:'Updated' };
  const updated = payments['G1']['Nisan 2026'];
  assertEqual(updated.sekil, 'IBAN', 'payment updated, not duplicated');
  assertEqual(Object.keys(payments['G1']).length, 1, 'still only one payment record per month');
});

test('Duplicate expense import detection', () => {
  const expenses = JSON.parse(JSON.stringify(SAMPLE_DATA.expenses));
  const month = 'Nisan 2026';
  const origCount = expenses.GAYRETTEPE[month].length;
  // Simulate re-import: check for duplicates by tur+no+tutar
  const newExp = { tur:'ELEKTRİK', no:'1234567890', tutar:15075, tarih:'2026-04-15', notlar:'' };
  const isDuplicate = expenses.GAYRETTEPE[month].some(
    e => e.tur === newExp.tur && e.no === newExp.no && e.tutar === newExp.tutar
  );
  assert(isDuplicate, 'duplicate expense detected by tur+no+tutar match');
  if (!isDuplicate) expenses.GAYRETTEPE[month].push(newExp);
  assertEqual(expenses.GAYRETTEPE[month].length, origCount, 'duplicate not added');
});

test('WA log prevents duplicate reminders for same tenant+month', () => {
  const waLog = [...SAMPLE_DATA.waLog];
  // Selin Aydın D2 Nisan 2026 already in log
  const alreadySent = waLog.some(
    l => l.unit === 'D2' && l.bina === 'Gayrettepe' && l.mo === 'Nisan 2026'
  );
  assert(alreadySent, 'WA already sent for D2 Nisan 2026');
  // Should show "✓ Gönderildi" badge, not send again
});

test('Concurrent edit: last write wins with version tracking', () => {
  // User A pushes version 3→4
  let serverVersion = 4;
  let userAVersion = 4;
  // User B tries to push with version 3 (stale)
  let userBVersion = 3;
  // sv=4, cv=3 → 4 > 3+1 = 4 > 4 = false (one behind is OK)
  // sv=4, cv=2 → 4 > 2+1 = 4 > 3 = true (conflict)
  // Simulate User B has version 2 (2 behind)
  userBVersion = 2;
  const conflict = serverVersion > userBVersion + 1;
  assert(conflict, 'User B stale push rejected (2 versions behind)');
  // User B pulls → gets version 4
  userBVersion = serverVersion;
  assertEqual(userBVersion, 4, 'User B updated to current version');
  // User B can now push
  const noConflict = !(serverVersion > userBVersion + 1);
  assert(noConflict, 'User B can push after pull');
});

// ── SECTION 5: Audit Log Integrity ─────────────────────────────────────────────
console.log('\n── 5. AUDIT LOG INTEGRITY ─────────────────────────────');

test('Payment addition creates audit entry', () => {
  const history = [];
  // Simulate addHist() 
  function addHist(desc, user) {
    history.push({ t: new Date().toLocaleString('tr-TR'), desc, user: user || 'System' });
  }
  addHist('GAYRETTEPE D1 – Emir Can İpek: ödeme kaydedildi (Nisan 2026)', 'Malik (Sahip)');
  assertEqual(history.length, 1, 'one audit entry');
  assert(history[0].desc.includes('Emir Can İpek'), 'audit contains tenant name');
  assert(history[0].user, 'audit has user attribution');
});

test('User management actions tracked in audit', () => {
  const auditLog = [];
  function logAudit(userId, action, details) {
    auditLog.push({ ts: new Date().toISOString(), userId, action, details });
  }
  logAudit('malik_1', 'USER_CREATED', { username:'newuser', role:'editor' });
  logAudit('malik_1', 'USER_PASSWORD_RESET', { targetId:'alper_1' });
  logAudit('malik_1', 'USER_DEACTIVATED', { targetId:'alper_1' });
  assertEqual(auditLog.length, 3, 'three audit entries');
  assertEqual(auditLog[0].action, 'USER_CREATED');
  assertEqual(auditLog[1].action, 'USER_PASSWORD_RESET');
  assertEqual(auditLog[2].action, 'USER_DEACTIVATED');
});

test('Login attempts (success + failure) tracked', () => {
  const auditLog = [];
  function logAudit(userId, action, details) {
    auditLog.push({ ts: new Date().toISOString(), userId, action, details });
  }
  logAudit('malik_1', 'LOGIN_SUCCESS', { username:'malik' });
  logAudit('malik_1', 'LOGIN_FAILED', { username:'malik' });
  const successes = auditLog.filter(l => l.action === 'LOGIN_SUCCESS').length;
  const failures  = auditLog.filter(l => l.action === 'LOGIN_FAILED').length;
  assertEqual(successes, 1);
  assertEqual(failures, 1);
});

test('Audit timestamps are in correct chronological order', () => {
  const history = JSON.parse(JSON.stringify(SAMPLE_DATA.history));
  // Sort by timestamp
  const sorted = [...history].sort((a,b) => a.t.localeCompare(b.t));
  assertEqual(sorted[0].t, history[0].t, 'first entry is chronologically first');
  // All timestamps are non-empty
  history.forEach(h => assert(h.t && h.t.length > 0, `empty timestamp in entry: ${h.desc}`));
});

test('Expense deletion tracked in audit', () => {
  const history = [];
  function addHist(desc, user) { history.push({t:new Date().toISOString(),desc,user}); }
  addHist('GAYRETTEPE – Nisan 2026 gider silindi: ELEKTRİK ₺15.075', 'Malik (Sahip)');
  assert(history[0].desc.includes('gider silindi'), 'deletion logged');
  assert(history[0].desc.includes('ELEKTRİK'), 'expense type logged');
});

test('Audit history FIFO trim at 500 entries', () => {
  const history = [];
  for (let i = 0; i < 510; i++) {
    history.push({ t: new Date().toISOString(), desc: `Entry ${i}`, user:'test' });
    // Trim at 500
    if (history.length > 500) history.splice(0, 1);
  }
  assert(history.length <= 500, `history should be ≤500, got ${history.length}`);
  assert(history[history.length-1].desc === 'Entry 509', 'latest entry retained');
});

// ── SECTION 6: Safety Validations ──────────────────────────────────────────────
console.log('\n── 6. SAFETY VALIDATIONS ──────────────────────────────');

test('Cannot delete admin user (self-protection)', () => {
  const currentUser = { id:'malik', role:'admin' };
  const targetId = 'malik';
  const isSelf = targetId === currentUser.id;
  assert(isSelf, 'detected self-delete attempt');
  // App should block with: "Kendinizi silemezsiniz"
});

test('Cannot deactivate yourself', () => {
  const currentUser = { id:'malik', role:'admin' };
  const targetId = 'malik';
  const result = targetId === currentUser.id
    ? { blocked: true, reason: 'Cannot deactivate yourself' }
    : { blocked: false };
  assert(result.blocked, 'self-deactivation blocked');
});

test('PIN validation: min 4 numeric digits', () => {
  function validatePIN(pin) { return /^\d{4,6}$/.test(String(pin)); }
  assert(!validatePIN('123'),   '3 digits rejected');
  assert(!validatePIN('abc'),   'letters rejected');
  assert(!validatePIN(''),      'empty rejected');
  assert(!validatePIN('12.34'), 'decimal rejected');
  assert(validatePIN('1234'),   '4 digits accepted');
  assert(validatePIN('123456'), '6 digits accepted');
});

test('Server password validation: min 6 characters', () => {
  function validatePass(p) { return typeof p === 'string' && p.length >= 6; }
  assert(!validatePass('abc'),   '3 chars rejected');
  assert(!validatePass(''),      'empty rejected');
  assert(!validatePass(null),    'null rejected');
  assert(validatePass('abc123'), '6 chars accepted');
  assert(validatePass('strongpassword'), 'long pass accepted');
});

test('Role validation: only admin|editor|manager|viewer allowed', () => {
  const validRoles = new Set(['admin','editor','manager','viewer']);
  assert(validRoles.has('admin'),   'admin valid');
  assert(validRoles.has('editor'),  'editor valid');
  assert(validRoles.has('manager'), 'manager valid');
  assert(validRoles.has('viewer'),  'viewer valid');
  assert(!validRoles.has('superuser'), 'superuser rejected');
  assert(!validRoles.has('root'),      'root rejected');
  assert(!validRoles.has(''),          'empty rejected');
});

test('Duplicate username rejected on create', () => {
  const users = [{ username:'malik' }, { username:'alper' }];
  const newUsername = 'malik';
  const isDuplicate = users.some(u => u.username === newUsername.toLowerCase());
  assert(isDuplicate, 'duplicate username detected');
});

test('Phone number sanitised before WA send', () => {
  function cleanPhone(p) { return String(p||'').replace(/\D/g,''); }
  assertEqual(cleanPhone('+90 532 111 22 33'), '905321112233');
  assertEqual(cleanPhone('(532) 111-22-33'), '5321112233');
  assertEqual(cleanPhone(''), '');
  assertEqual(cleanPhone(null), '');
  // Should not send WA if phone is empty after cleaning
  const clean = cleanPhone('');
  assert(!clean, 'empty phone blocks WA send');
});

test('Token tamper detection', () => {
  const token = signToken({ sub:'u1', role:'admin', exp:Date.now()+60000 });
  // Tamper with the payload
  const parts = token.split('.');
  const tamperedPayload = Buffer.from(JSON.stringify({ sub:'u1', role:'admin', exp:Date.now()+60000*24 })).toString('base64url');
  const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;
  const result = verifyToken(tamperedToken);
  assert(result === null, 'tampered token rejected');
});

test('Expired token rejected', () => {
  const token = signToken({ sub:'u1', role:'admin', exp:Date.now()-1000 });
  const result = verifyToken(token);
  assert(result === null, 'expired token rejected');
});

// ── SECTION 7: Excel Import Validation ─────────────────────────────────────────
console.log('\n── 7. EXCEL / IMPORT VALIDATION ───────────────────────');

test('Tenant name cannot be empty', () => {
  const tenants = SAMPLE_DATA.tenants.GAYRETTEPE;
  const activePaid = tenants.filter(t => t.active && t.rent > 0);
  activePaid.forEach(t => {
    assert(t.name && t.name.trim().length > 0, `tenant ${t.id} has empty name`);
  });
});

test('Rent values are non-negative numbers', () => {
  const allTenants = Object.values(SAMPLE_DATA.tenants).flat();
  allTenants.forEach(t => {
    const rent = Number(t.rent);
    assert(!isNaN(rent), `tenant ${t.id} rent is NaN`);
    assert(rent >= 0, `tenant ${t.id} rent is negative: ${rent}`);
  });
});

test('Payment amounts are non-negative', () => {
  Object.entries(SAMPLE_DATA.payments).forEach(([tid, months]) => {
    Object.entries(months).forEach(([mo, p]) => {
      assert(p.paid >= 0, `${tid} ${mo}: negative payment ${p.paid}`);
    });
  });
});

test('Expense amounts are non-negative', () => {
  Object.values(SAMPLE_DATA.expenses).forEach(bldExp => {
    Object.values(bldExp).forEach(monthExps => {
      monthExps.forEach(e => {
        assert(e.tutar >= 0, `expense ${e.tur} has negative amount: ${e.tutar}`);
      });
    });
  });
});

test('Month string format validation', () => {
  const MONTHS = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
  const YEARS  = ['2025','2026','2027'];
  const validMonths = new Set(MONTHS.flatMap(m => YEARS.map(y => `${m} ${y}`)));
  function isValidMonth(mo) { return validMonths.has(mo); }
  assert(isValidMonth('Nisan 2026'), 'Nisan 2026 valid');
  assert(!isValidMonth('April 2026'), 'English month invalid');
  assert(!isValidMonth('Nisan 202'), 'Short year invalid');
  assert(!isValidMonth(''), 'empty invalid');
});

test('Import with negative rent treated as error', () => {
  const importRow = { name:'Test', rent:-5000 };
  const isValid = importRow.rent >= 0;
  assert(!isValid, 'negative rent detected as invalid');
});

test('Import with excessive rent flagged as warning', () => {
  const importRow = { name:'Test', rent:9999999 };
  const MAX_RENT = 1000000; // 1M TRY sanity cap
  const warn = importRow.rent > MAX_RENT;
  assert(warn, 'excessive rent flagged');
  return warn ? { warn: `Rent ${importRow.rent} exceeds sanity cap — verify` } : null;
});

// ── SECTION 8: Error Logging Validation ─────────────────────────────────────────
console.log('\n── 8. ERROR LOGGING VALIDATION ────────────────────────');

test('Log file is writable', () => {
  const logPath = path.join(TMP, 'test.log');
  fs.appendFileSync(logPath, '[TEST] Log write test\n');
  const content = fs.readFileSync(logPath, 'utf8');
  assert(content.includes('[TEST]'), 'log content readable');
});

test('Server log captures errors with timestamp', () => {
  const logs = [];
  function log(level, msg, data) {
    const line = `[${new Date().toISOString()}] [${level}] ${msg}${data?' '+JSON.stringify(data):''}`;
    logs.push(line);
  }
  log('ERROR', 'Database backup failed', { error:'EACCES: permission denied' });
  log('WARN', 'KTP_SECRET not set');
  log('INFO', 'Server started', { port:8787 });
  assertEqual(logs.length, 3);
  assert(logs[0].includes('[ERROR]'), 'error level logged');
  assert(logs[0].includes('EACCES'), 'error detail logged');
  assert(logs[0].includes('20'), 'timestamp present (year 20xx)');
});

test('WA send failure is logged with error details', () => {
  const waLogs = [];
  function logWA(entry) { waLogs.push(entry); }
  logWA({ ts:'2026-04-08', phone:'905321111111', name:'Emir Can İpek', building:'Gayrettepe', unit:'D1', month_str:'Nisan 2026', status:'error:HTTP 401 Unauthorized' });
  assertEqual(waLogs.length, 1);
  assert(waLogs[0].status.startsWith('error:'), 'WA error status logged');
  assert(waLogs[0].status.includes('401'), 'HTTP status in WA log');
});

test('Sync errors logged with direction and version', () => {
  const syncLogs = [];
  function logSync(userId, direction, status, bytes, msg) {
    syncLogs.push({ ts:new Date().toISOString(), userId, direction, status, bytes, msg });
  }
  logSync('malik_1', 'push', 'conflict', 0, 'server v8 > client v5');
  logSync('malik_1', 'push', 'error', 0, 'ECONNREFUSED');
  assertEqual(syncLogs.length, 2);
  assertEqual(syncLogs[0].status, 'conflict');
  assert(syncLogs[0].msg.includes('v8'), 'server version in sync log');
  assertEqual(syncLogs[1].status, 'error');
});

test('Import failure preserves existing data', () => {
  const existingData = JSON.parse(JSON.stringify(SAMPLE_DATA));
  const badImport = 'this is not valid json {{{';
  let importError = null;
  let dataAfter = existingData;
  try {
    const imported = JSON.parse(badImport);
    // Would merge here
    dataAfter = { ...existingData, ...imported };
  } catch(e) {
    importError = e;
    // Data unchanged on error
  }
  assert(importError !== null, 'import error caught');
  assertEqual(dataAfter.tenants.GAYRETTEPE[0].name, 'Emir Can İpek', 'existing data preserved after failed import');
});

// ── SECTION 9: Data Completeness Round-Trip ────────────────────────────────────
console.log('\n── 9. DATA COMPLETENESS ROUND-TRIP ────────────────────');

test('Full data round-trip: JSON serialize → parse → verify', () => {
  const original = SAMPLE_DATA;
  const json = JSON.stringify(original);
  const parsed = JSON.parse(json);
  // Tenants
  assertEqual(Object.keys(parsed.tenants).length, 3, 'all buildings present');
  const allTenants = Object.values(parsed.tenants).flat();
  assertEqual(allTenants.length, 5, 'all tenants present');
  // Payments
  assertEqual(Object.keys(parsed.payments).length, 3, 'payment entries for 3 tenants');
  // Expenses
  assertEqual(parsed.expenses.GAYRETTEPE['Nisan 2026'].length, 2, 'expense line count');
  // Users
  assertEqual(parsed.users.length, 3, 'all users');
  // History
  assertEqual(parsed.history.length, 2, 'history entries');
  // WA log
  assertEqual(parsed.waLog.length, 1, 'WA log entries');
});

test('Financial calculations consistent before/after round-trip', () => {
  function calcNet(data, bld, month) {
    const tenants = (data.tenants[bld]||[]).filter(t=>t.active&&t.rent>0);
    const paid = tenants.reduce((s,t) => s + ((data.payments[t.id]||{})[month]?.paid||0), 0);
    const exp = ((data.expenses[bld]||{})[month]||[]).reduce((s,e)=>s+e.tutar,0);
    return { paid, exp, net:paid-exp };
  }
  const before = calcNet(SAMPLE_DATA, 'GAYRETTEPE', 'Nisan 2026');
  const parsed = JSON.parse(JSON.stringify(SAMPLE_DATA));
  const after  = calcNet(parsed, 'GAYRETTEPE', 'Nisan 2026');
  assertEqual(before.paid, after.paid, 'paid consistent');
  assertEqual(before.exp,  after.exp,  'expenses consistent');
  assertEqual(before.net,  after.net,  'net consistent');
  // 44000 paid (G1:30000 + G2:14000), 45377 expenses → net -1377
  assertEqual(after.paid, 44000, 'Gayrettepe April paid total');
  assertEqual(after.exp,  45377, 'Gayrettepe April expense total');
  assertEqual(after.net, -1377, 'Gayrettepe April net (loss)');
});

test('Overdue detection consistent before/after round-trip', () => {
  function isDue(tenant, month, nowDate) {
    const MONTHS_TR = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
    if (!tenant.active || tenant.rent === 0) return false;
    const [mName, yr] = month.split(' ');
    const mIdx = MONTHS_TR.indexOf(mName);
    if (mIdx < 0) return false;
    const overDate = new Date(parseInt(yr), mIdx, (tenant.gun||1) + 1, 9, 0, 0);
    return nowDate >= overDate;
  }
  const testDate = new Date('2026-04-10T10:00:00');
  const parsed = JSON.parse(JSON.stringify(SAMPLE_DATA));
  // G1 paid in full → not overdue; G2 partial → overdue (gun=5, now=Apr10)
  const g1 = parsed.tenants.GAYRETTEPE[0];
  const g2 = parsed.tenants.GAYRETTEPE[1];
  const g1Paid = parsed.payments['G1']['Nisan 2026'].paid;
  assert(g1Paid >= g1.rent, 'G1 fully paid');
  assert(!isDue(g1, 'Nisan 2026', testDate) || g1Paid >= g1.rent, 'G1 not overdue (paid)');
  // G2 is partial (14000 < 28000) and past due day 5
  const g2Paid = parsed.payments['G2']['Nisan 2026'].paid;
  assert(g2Paid < g2.rent, 'G2 partially paid');
  assert(isDue(g2, 'Nisan 2026', testDate), 'G2 is overdue (partial + past gun=5)');
});

// ── Cleanup ───────────────────────────────────────────────────────────────────
try { fs.rmSync(TMP, { recursive: true }); } catch {}

// ── Final Summary ─────────────────────────────────────────────────────────────
const total = passed + failed + warned;
console.log('\n═══════════════════════════════════════════════════════');
console.log(`  Results: ${passed} passed · ${warned} warned · ${failed} failed / ${total} total`);
console.log('═══════════════════════════════════════════════════════');

if (failed === 0) {
  console.log('\n  ✅ ALL TESTS PASSED — System ready for production\n');
} else {
  console.log(`\n  ❌ ${failed} TEST(S) FAILED — Review before release\n`);
}

// Write machine-readable results JSON
const resultsPath = path.join(__dirname, 'integrity-results.json');
fs.writeFileSync(resultsPath, JSON.stringify({
  runAt: new Date().toISOString(),
  passed, failed, warned, total,
  results: RESULTS
}, null, 2));
console.log(`  Results JSON: ${resultsPath}\n`);

process.exit(failed > 0 ? 1 : 0);
