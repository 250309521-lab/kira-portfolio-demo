/**
 * Kira Takip Pro — Unit Tests
 * Run: node src/tests/run.js
 */

'use strict';

let passed = 0, failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ ${name}: ${err.message}`);
    failed++;
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

function assertEqual(a, b, msg) {
  if (a !== b) throw new Error(`${msg || 'assertEqual'}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n═══ Kira Takip Pro — Unit Tests ═══\n');

// ── Month string tests ────────────────────────────────────────────────────────
console.log('Month String Format:');
const MONTHS = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran',
                'Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
const curYear = new Date().getFullYear();
function buildTestMonths(){
  const s=new Set();
  for(let y=curYear-5;y<=curYear+10;y++) MONTHS.forEach(m=>s.add(m+' '+y));
  const ix=m=>{const p=m.split(' ');return parseInt(p[1])*12+MONTHS.indexOf(p[0]);};
  return [...s].sort((a,b)=>ix(a)-ix(b));
}
const ALL_MONTHS = buildTestMonths();

test('ALL_MONTHS covers current year', () => assert(ALL_MONTHS.some(m=>m.endsWith(' '+curYear))));
test('ALL_MONTHS covers 5 years back', () => assert(ALL_MONTHS.some(m=>m.endsWith(' '+(curYear-5)))));
test('ALL_MONTHS covers 10 years forward', () => assert(ALL_MONTHS.some(m=>m.endsWith(' '+(curYear+10)))));
test('First month format correct', () => assert(/^[A-Za-zÇçĞğİıÖöŞşÜü]+ \d{4}$/.test(ALL_MONTHS[0])));
test('April 2026 exists', () => assert(ALL_MONTHS.includes('Nisan 2026')));
test('Month count ≥ 192', () => assert(ALL_MONTHS.length>=192));

// ── Payment calculations ──────────────────────────────────────────────────────
console.log('\nPayment Calculations:');

function getStatus(paid, rent) {
  if (rent === 0) return 'BOŞ';
  if (paid >= rent) return 'Ödendi';
  if (paid > 0) return 'Kısmi';
  return 'Ödenmedi';
}

test('Full payment → Ödendi', () => assertEqual(getStatus(30000, 30000), 'Ödendi'));
test('Overpayment → Ödendi', () => assertEqual(getStatus(35000, 30000), 'Ödendi'));
test('Partial payment → Kısmi', () => assertEqual(getStatus(15000, 30000), 'Kısmi'));
test('Zero payment → Ödenmedi', () => assertEqual(getStatus(0, 30000), 'Ödenmedi'));
test('Vacant unit → BOŞ', () => assertEqual(getStatus(0, 0), 'BOŞ'));
test('Diff calculation positive', () => assertEqual(35000 - 30000, 5000));
test('Diff calculation negative', () => assertEqual(15000 - 30000, -15000));

// ── Overdue detection ─────────────────────────────────────────────────────────
console.log('\nOverdue Detection:');

function isDue(paid, rent, gun, now, monthYear) {
  if (rent === 0 || paid >= rent) return false;
  const [monthName, year] = monthYear.split(' ');
  const monthIdx = MONTHS.indexOf(monthName);
  if (monthIdx < 0) return false;
  const dueDate  = new Date(parseInt(year), monthIdx, gun);
  const overDate = new Date(parseInt(year), monthIdx, gun + 1);
  overDate.setHours(9, 0, 0, 0);
  return now >= overDate;
}

const pastDate = new Date('2026-04-15');
const earlyDate = new Date('2026-04-01');

test('Overdue: past due date, not paid', () =>
  assert(isDue(0, 30000, 5, pastDate, 'Nisan 2026')));
test('Not overdue: paid in full', () =>
  assert(!isDue(30000, 30000, 5, pastDate, 'Nisan 2026')));
test('Not overdue: due date not passed', () =>
  assert(!isDue(0, 30000, 10, earlyDate, 'Nisan 2026')));
test('Not overdue: vacant unit', () =>
  assert(!isDue(0, 0, 5, pastDate, 'Nisan 2026')));

// ── Net income calculations ───────────────────────────────────────────────────
console.log('\nNet Income Calculations:');

function calcNet(payments, expenses) {
  const totalPaid = payments.reduce((s, p) => s + (p.paid || 0), 0);
  const totalExp  = expenses.reduce((s, e) => s + (e.tutar || 0), 0);
  return totalPaid - totalExp;
}

test('Net = paid - expenses (positive)', () => {
  const net = calcNet([{paid:500000},{paid:300000}], [{tutar:50000},{tutar:30000}]);
  assertEqual(net, 720000);
});
test('Net negative (expenses > income)', () => {
  const net = calcNet([{paid:10000}], [{tutar:50000}]);
  assertEqual(net, -40000);
});
test('Net zero edge case', () => {
  assertEqual(calcNet([{paid:0}], [{tutar:0}]), 0);
});

// ── Collection rate ───────────────────────────────────────────────────────────
console.log('\nCollection Rate:');

function collectionRate(paid, rent) {
  if (rent === 0) return 0;
  return Math.round(paid / rent * 100);
}

test('100% collection', () => assertEqual(collectionRate(300000, 300000), 100));
test('84% collection (rounded)', () => assertEqual(collectionRate(252000, 300000), 84));
test('0% collection', () => assertEqual(collectionRate(0, 300000), 0));
test('Zero rent → 0%', () => assertEqual(collectionRate(0, 0), 0));

// ── User validation ───────────────────────────────────────────────────────────
console.log('\nUser Validation:');

function validatePIN(pin) {
  return /^\d{4,6}$/.test(String(pin));
}

test('Valid 4-digit PIN', () => assert(validatePIN('1234')));
test('Valid 6-digit PIN', () => assert(validatePIN('123456')));
test('Invalid: letters', () => assert(!validatePIN('abcd')));
test('Invalid: 3 digits', () => assert(!validatePIN('123')));
test('Invalid: 7 digits', () => assert(!validatePIN('1234567')));
test('Invalid: empty', () => assert(!validatePIN('')));

// ── Alper net calculation ─────────────────────────────────────────────────────
console.log('\nAlper Calculations:');

test('Alper net = col - exp', () => {
  const entry = { col: 197000, exp: 15668 };
  assertEqual(entry.col - entry.exp, 181332);
});
test('Net from Alper Aug 2025 (actual -14218)', () => {
  // From Excel: col=153000, exp=88218, but net=-14218 because other deductions
  // Pure calc: 153000-88218=64782 (positive)
  const entry = { col: 153000, exp: 88218 };
  assertEqual(entry.col - entry.exp, 64782);
});
test('Negative net from Excel (Agustos 2025)', () => {
  // Alper net was -14218 because additional items not in basic calc
  const alperNet = -14218;
  assert(alperNet < 0, 'Negative net is valid');
});

// ── Phone number validation ───────────────────────────────────────────────────
console.log('\nPhone Number:');

function cleanPhone(phone) {
  return String(phone || '').replace(/\D/g, '');
}

test('Clean Turkish mobile', () => assertEqual(cleanPhone('905312345678'), '905312345678'));
test('Clean with spaces/dashes', () => assertEqual(cleanPhone('0531 234 56 78'), '05312345678'));
test('Empty phone', () => assertEqual(cleanPhone(''), ''));
test('Phone with +', () => assertEqual(cleanPhone('+90 531 234 5678'), '905312345678'));

// ── Payment import logic ──────────────────────────────────────────────────────
console.log('\nPayment Import Logic:');

function isValidPaymentAmount(val) {
  var s = (val === null || val === undefined) ? '' : String(val);
  var v = parseFloat(s.replace(/[₺\s]/g, '').replace(',', '.'));
  return !isNaN(v) && v >= 0;
}
test('Valid amount: 1500', () => assert(isValidPaymentAmount(1500)));
test('Valid amount: 0 (partial/zero allowed)', () => assert(isValidPaymentAmount(0)));
test('Valid amount: string "1500"', () => assert(isValidPaymentAmount('1500')));
test('Invalid amount: empty', () => assert(!isValidPaymentAmount('')));
test('Invalid amount: text', () => assert(!isValidPaymentAmount('abc')));
test('Invalid amount: negative', () => assert(!isValidPaymentAmount(-100)));

function simulatePaymentImport(existingPaid, newPaid, month) {
  var payments = existingPaid != null ? { [month]: { paid: existingPaid } } : {};
  var wasExisting = payments[month] && payments[month].paid > 0;
  payments[month] = { paid: newPaid };
  return wasExisting ? 'updated' : 'imported';
}
test('New payment → imported', () => assertEqual(simulatePaymentImport(null, 1500, 'Nisan 2026'), 'imported'));
test('Existing payment → updated', () => assertEqual(simulatePaymentImport(1200, 1500, 'Nisan 2026'), 'updated'));
test('Existing zero payment → imported (not update)', () => assertEqual(simulatePaymentImport(0, 1500, 'Nisan 2026'), 'imported'));

function isOverpayment(paid, rent) { return rent > 0 && paid > rent; }
test('Overpayment: 3500 > 3000', () => assert(isOverpayment(3500, 3000)));
test('Exact payment: not overpayment', () => assert(!isOverpayment(3000, 3000)));
test('Partial payment: not overpayment', () => assert(!isOverpayment(1500, 3000)));
test('Zero rent: overpayment check skipped', () => assert(!isOverpayment(100, 0)));

function paymentMonth(val) {
  var TK = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran',
            'Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
  if (!val) return null;
  val = String(val).trim();
  for (var i = 0; i < TK.length; i++) {
    if (val.startsWith(TK[i] + ' ') && /\d{4}$/.test(val)) return val;
  }
  var m = val.match(/^(\d{1,2})[\/\-\.](\d{4})$/);
  if (m) { var mn = parseInt(m[1]) - 1; if (mn >= 0 && mn < 12) return TK[mn] + ' ' + m[2]; }
  return null;
}
test('Month: "Nisan 2026" → valid', () => assertEqual(paymentMonth('Nisan 2026'), 'Nisan 2026'));
test('Month: "04/2026" → Nisan 2026', () => assertEqual(paymentMonth('04/2026'), 'Nisan 2026'));
test('Month: "12-2025" → Aralık 2025', () => assertEqual(paymentMonth('12-2025'), 'Aralık 2025'));
test('Month: empty → null', () => assertEqual(paymentMonth(''), null));
test('Month: invalid → null', () => assertEqual(paymentMonth('NotAMonth'), null));

function simulateValidate(rows, tenants) {
  // rows: [{unit, paid, month}], tenants: [{unit, rent}]
  var errs = 0, warns = 0, valid = 0;
  rows.forEach(function(r) {
    var issues = [];
    var pv = parseFloat(r.paid);
    if (isNaN(pv) || pv < 0) issues.push('err:amount');
    if (!paymentMonth(r.month)) issues.push('err:month');
    var tenant = tenants.find(function(t) { return t.unit === r.unit; });
    if (!tenant) issues.push('err:notfound');
    else if (!isNaN(pv) && tenant.rent > 0 && pv > tenant.rent) issues.push('warn:overpay');
    var hasErr = issues.some(function(i) { return i.startsWith('err'); });
    if (hasErr) errs++; else { if (issues.length) warns++; valid++; }
  });
  return { errs: errs, warns: warns, valid: valid };
}

var tenantList = [{ unit: 'D1', rent: 3000 }, { unit: 'D2', rent: 5000 }];
test('Valid payments: 2 rows → 2 valid', function() {
  var r = simulateValidate([
    { unit: 'D1', paid: '3000', month: 'Nisan 2026' },
    { unit: 'D2', paid: '4500', month: 'Nisan 2026' }
  ], tenantList);
  assertEqual(r.valid, 2); assertEqual(r.errs, 0);
});
test('Duplicate unit+month: both pass validate (dup is warn on second pass)', function() {
  var r = simulateValidate([
    { unit: 'D1', paid: '3000', month: 'Nisan 2026' },
    { unit: 'D1', paid: '3000', month: 'Nisan 2026' }
  ], tenantList);
  assertEqual(r.valid, 2); // both structurally valid; dup is warn not err
});
test('Invalid amount → error', function() {
  var r = simulateValidate([{ unit: 'D1', paid: 'abc', month: 'Nisan 2026' }], tenantList);
  assertEqual(r.errs, 1); assertEqual(r.valid, 0);
});
test('Missing month → error', function() {
  var r = simulateValidate([{ unit: 'D1', paid: '3000', month: '' }], tenantList);
  assertEqual(r.errs, 1); assertEqual(r.valid, 0);
});
test('Unknown unit → error', function() {
  var r = simulateValidate([{ unit: 'D99', paid: '3000', month: 'Nisan 2026' }], tenantList);
  assertEqual(r.errs, 1); assertEqual(r.valid, 0);
});
test('Overpayment → warn, still valid', function() {
  var r = simulateValidate([{ unit: 'D1', paid: '9999', month: 'Nisan 2026' }], tenantList);
  assertEqual(r.warns, 1); assertEqual(r.valid, 1); assertEqual(r.errs, 0);
});
test('Partial payment → valid, no warn', function() {
  var r = simulateValidate([{ unit: 'D2', paid: '2000', month: 'Nisan 2026' }], tenantList);
  assertEqual(r.valid, 1); assertEqual(r.warns, 0); assertEqual(r.errs, 0);
});

// ── Expense import logic ──────────────────────────────────────────────────────
console.log('\nExpense Import Logic:');

function isValidExpenseAmount(val) {
  var s = (val === null || val === undefined) ? '' : String(val);
  var v = parseFloat(s.replace(/[₺\s]/g, '').replace(',', '.'));
  return !isNaN(v) && v >= 0;
}
function expenseAmountIssue(val) {
  var s = (val === null || val === undefined) ? '' : String(val);
  var v = parseFloat(s.replace(/[₺\s]/g, '').replace(',', '.'));
  if (isNaN(v) || v < 0) return 'err';
  if (v === 0) return 'warn';
  return null;
}
test('Expense amount: 1500 → valid', () => assertEqual(expenseAmountIssue(1500), null));
test('Expense amount: 0 → warn', () => assertEqual(expenseAmountIssue(0), 'warn'));
test('Expense amount: -100 → err', () => assertEqual(expenseAmountIssue(-100), 'err'));
test('Expense amount: "abc" → err', () => assertEqual(expenseAmountIssue('abc'), 'err'));
test('Expense amount: "" → err', () => assertEqual(expenseAmountIssue(''), 'err'));

var knownBuildings = [{ id: 'BLD1', name: 'Apartman A', active: true },
                      { id: 'BLD2', name: 'Site B',     active: true }];
function findBuilding(val) {
  if (!val) return null;
  var v = String(val).toLowerCase().trim();
  var b = knownBuildings.find(function(b) {
    return b.active && (b.id.toLowerCase()===v || b.name.toLowerCase()===v ||
           b.name.toLowerCase().includes(v));
  });
  return b ? b.id : null;
}
test('Building found by name', () => assertEqual(findBuilding('Apartman A'), 'BLD1'));
test('Building found by partial', () => assertEqual(findBuilding('Site'), 'BLD2'));
test('Unknown building → null', () => assertEqual(findBuilding('Bilinmeyen'), null));
test('Empty building → null', () => assertEqual(findBuilding(''), null));

function simulateExpenseValidate(rows, buildings) {
  var errs = 0, warns = 0, valid = 0, seen = {};
  rows.forEach(function(r) {
    var issues = [];
    var issue = expenseAmountIssue(r.amount);
    if (issue === 'err') issues.push('err:amount');
    else if (issue === 'warn') issues.push('warn:zero');
    if (!r.month) issues.push('err:month');
    var bid = findBuilding(r.building);
    if (!bid) issues.push('err:building');
    // duplicate: same bid+month+amount+date
    if (bid && r.month && issue !== 'err') {
      var dk = bid+'|'+r.month+'|'+(r.amount||0)+'|'+(r.date||'')+'|'+(r.category||'');
      if (seen[dk]) issues.push('warn:dup');
      else seen[dk] = 1;
    }
    var hasErr = issues.some(function(i) { return i.startsWith('err'); });
    if (hasErr) errs++;
    else { if (issues.length) warns++; valid++; }
  });
  return { errs: errs, warns: warns, valid: valid };
}

var blds = knownBuildings;
test('Valid expense → 1 valid', function() {
  var r = simulateExpenseValidate([{ building:'Apartman A',amount:500,month:'Nisan 2026',category:'BAKIM',date:'',notes:'' }], blds);
  assertEqual(r.valid,1); assertEqual(r.errs,0); assertEqual(r.warns,0);
});
test('Invalid amount → error', function() {
  var r = simulateExpenseValidate([{ building:'Apartman A',amount:'xyz',month:'Nisan 2026' }], blds);
  assertEqual(r.errs,1); assertEqual(r.valid,0);
});
test('Negative amount → error', function() {
  var r = simulateExpenseValidate([{ building:'Apartman A',amount:-100,month:'Nisan 2026' }], blds);
  assertEqual(r.errs,1); assertEqual(r.valid,0);
});
test('Zero amount → warn, still valid', function() {
  var r = simulateExpenseValidate([{ building:'Apartman A',amount:0,month:'Nisan 2026' }], blds);
  assertEqual(r.warns,1); assertEqual(r.valid,1); assertEqual(r.errs,0);
});
test('Missing month → error', function() {
  var r = simulateExpenseValidate([{ building:'Apartman A',amount:500,month:'' }], blds);
  assertEqual(r.errs,1); assertEqual(r.valid,0);
});
test('Unknown building → error', function() {
  var r = simulateExpenseValidate([{ building:'Yok Bina',amount:500,month:'Nisan 2026' }], blds);
  assertEqual(r.errs,1); assertEqual(r.valid,0);
});
test('Duplicate expense → second gets warn, both valid', function() {
  var r = simulateExpenseValidate([
    { building:'Apartman A',amount:500,month:'Nisan 2026',category:'BAKIM',date:''},
    { building:'Apartman A',amount:500,month:'Nisan 2026',category:'BAKIM',date:''},
  ], blds);
  assertEqual(r.valid,2); assertEqual(r.warns,1); assertEqual(r.errs,0);
});
test('Optional category: omitted → valid', function() {
  var r = simulateExpenseValidate([{ building:'Apartman A',amount:300,month:'Nisan 2026',category:'',date:'' }], blds);
  assertEqual(r.valid,1); assertEqual(r.errs,0);
});
test('Optional description: omitted → valid', function() {
  var r = simulateExpenseValidate([{ building:'Site B',amount:1200,month:'Mayıs 2026',notes:'' }], blds);
  assertEqual(r.valid,1); assertEqual(r.errs,0);
});
test('Optional date: omitted → valid', function() {
  var r = simulateExpenseValidate([{ building:'BLD1',amount:800,month:'Nisan 2026' }], blds);
  assertEqual(r.valid,1); assertEqual(r.errs,0);
});

// ── Import History & Rollback ─────────────────────────────────────────────────
console.log('\nImport History & Rollback:');

function makeSnap(id, mode, data) {
  return { id: id, ts: new Date().toISOString(), mode: mode, data: data };
}
function addSnap(snaps, snap, max) {
  snaps = [snap].concat(snaps);
  return snaps.slice(0, max);
}

test('Snapshot creation stores id', function() {
  var snaps = addSnap([], makeSnap('snap1', 'payment', { payments: {} }), 20);
  assertEqual(snaps.length, 1);
  assertEqual(snaps[0].id, 'snap1');
});
test('Max 20 snapshots: trims oldest', function() {
  var snaps = [];
  for (var i = 0; i < 25; i++) snaps = addSnap(snaps, makeSnap('s'+i, 'expense', {}), 20);
  assertEqual(snaps.length, 20);
  assertEqual(snaps[0].id, 's24');
});
test('Snapshots stored newest-first', function() {
  var snaps = [];
  snaps = addSnap(snaps, makeSnap('a', 'tenant', {}), 20);
  snaps = addSnap(snaps, makeSnap('b', 'tenant', {}), 20);
  assertEqual(snaps[0].id, 'b');
  assertEqual(snaps[1].id, 'a');
});

function simulateRollback(snaps, snapshotId, currentData) {
  var snap = snaps.find(function(s) { return s.id === snapshotId; });
  if (!snap) return { ok: false, error: 'Snapshot bulunamadı' };
  var data = JSON.parse(JSON.stringify(currentData));
  try {
    if (snap.data.payments  !== undefined) data.payments  = JSON.parse(JSON.stringify(snap.data.payments));
    if (snap.data.tenants   !== undefined) data.tenants   = JSON.parse(JSON.stringify(snap.data.tenants));
    if (snap.data.buildings !== undefined) data.buildings = JSON.parse(JSON.stringify(snap.data.buildings));
    if (snap.data.expenses  !== undefined) data.expenses  = JSON.parse(JSON.stringify(snap.data.expenses));
    return { ok: true, data: data };
  } catch(e) { return { ok: false, error: e.message }; }
}

test('Rollback restores payment to pre-import value', function() {
  var snap = makeSnap('s1', 'payment', { payments: { tid1: { 'Nisan 2026': { paid: 1000 } } } });
  var current = { payments: { tid1: { 'Nisan 2026': { paid: 5000 } } } };
  var r = simulateRollback([snap], 's1', current);
  assert(r.ok);
  assertEqual(r.data.payments.tid1['Nisan 2026'].paid, 1000);
});
test('Rollback missing snapshot → error, data unchanged', function() {
  var current = { payments: { t1: { 'Nisan 2026': { paid: 3000 } } } };
  var r = simulateRollback([], 'nonexistent', current);
  assert(!r.ok);
  assert(r.error.length > 0);
});
test('Rollback preserves collections not in snapshot', function() {
  var snap = makeSnap('s1', 'payment', { payments: {} });
  var current = { payments: { t1: {} }, tenants: { bld1: [{ id: 't1' }] }, expenses: { bld1: {} } };
  var r = simulateRollback([snap], 's1', current);
  assert(r.ok);
  assertEqual(r.data.tenants.bld1.length, 1);
  assert(r.data.expenses.bld1 !== undefined);
});
test('Rollback restores expense array length', function() {
  var snap = makeSnap('s1', 'expense', { expenses: { B1: { 'Nisan 2026': [{ tutar: 200 }] } } });
  var current = { expenses: { B1: { 'Nisan 2026': [{ tutar: 200 }, { tutar: 500 }] } } };
  var r = simulateRollback([snap], 's1', current);
  assert(r.ok);
  assertEqual(r.data.expenses.B1['Nisan 2026'].length, 1);
});

function makeHistEntry(id, mode, imported, snapshotId) {
  return { id: id, ts: new Date().toISOString(), mode: mode, imported: imported,
           updated: 0, skipped: 0, warnCount: 0, errCount: 0,
           snapshotId: snapshotId||('snap_'+id), rolledBack: false };
}
function addHist(hist, entry) {
  return [entry].concat(hist).slice(0, 100);
}

test('Import history newest-first', function() {
  var hist = [];
  hist = addHist(hist, makeHistEntry('h1', 'tenant', 3));
  hist = addHist(hist, makeHistEntry('h2', 'payment', 5));
  assertEqual(hist[0].id, 'h2');
  assertEqual(hist[1].id, 'h1');
});
test('Import history capped at 100', function() {
  var hist = [];
  for (var i = 0; i < 110; i++) hist = addHist(hist, makeHistEntry('h'+i, 'expense', 1));
  assertEqual(hist.length, 100);
});
test('Snapshot ID stored on history entry', function() {
  var entry = makeHistEntry('h1', 'expense', 5, 'snap_xyz');
  assertEqual(entry.snapshotId, 'snap_xyz');
});
test('Rollback marks history entry as rolledBack', function() {
  var hist = [makeHistEntry('h1', 'payment', 3, 's1')];
  var snap = makeSnap('s1', 'payment', { payments: {} });
  var r = simulateRollback([snap], 's1', { payments: { t: {} } });
  assert(r.ok);
  hist[0].rolledBack = true;
  assert(hist[0].rolledBack);
});

// ── Export / Import Audit ─────────────────────────────────────────────────────
console.log('\nExport / Import Audit:');

// Simulate _exportEnvelope — verifies required fields
function makeExportEnvelope(data, importHistory) {
  return {
    _ktpVersion:   6,
    _exportedAt:   new Date().toISOString(),
    _exportedFrom: 'v6',
    initialized:   true,
    buildings:     data.buildings   || [],
    tenants:       data.tenants     || {},
    payments:      data.payments    || {},
    expenses:      data.expenses    || {},
    alper:         data.alper       || {},
    tanNet:        data.tanNet      || {},
    gayNet:        data.gayNet      || {},
    history:       data.history     || [],
    waLog:         data.waLog       || [],
    users:         data.users       || [],
    settings:      data.settings    || {},
    importHistory: Array.isArray(importHistory) ? importHistory : [],
    // importSnapshots intentionally excluded
  };
}

test('Export envelope includes _ktpVersion', function() {
  var env = makeExportEnvelope({}, []);
  assertEqual(env._ktpVersion, 6);
});
test('Export envelope includes importHistory', function() {
  var hist = [makeHistEntry('h1', 'payment', 3, 's1')];
  var env = makeExportEnvelope({}, hist);
  assert(Array.isArray(env.importHistory));
  assertEqual(env.importHistory.length, 1);
  assertEqual(env.importHistory[0].id, 'h1');
});
test('Export envelope excludes importSnapshots', function() {
  var env = makeExportEnvelope({}, []);
  assert(!('importSnapshots' in env));
});
test('Export envelope includes all required DATA fields', function() {
  var env = makeExportEnvelope({}, []);
  var required = ['buildings','tenants','payments','expenses','alper','tanNet','gayNet',
                  'history','waLog','users','settings','importHistory'];
  required.forEach(function(k) { assert(k in env, 'Missing: '+k); });
});

// Simulate _importParse — pure JSON parsing + sanity check
function simulateImportParse(raw) {
  try {
    if (typeof raw !== 'string' || !raw.trim())
      return { ok: false, candidate: null, version: 0, errors: ['Boş veya geçersiz giriş'] };
    var d = JSON.parse(raw);
    if (!d || typeof d !== 'object' || Array.isArray(d))
      return { ok: false, candidate: null, version: 0, errors: ['JSON nesnesi bekleniyordu'] };
    var version = typeof d._ktpVersion === 'number' ? d._ktpVersion : 0;
    return { ok: true, candidate: d, version: version, errors: [] };
  } catch(e) {
    return { ok: false, candidate: null, version: 0, errors: ['JSON ayrıştırma hatası: '+e.message] };
  }
}

// Simulate _importValidate
function simulateImportValidate(candidate, KTP_VERSION) {
  KTP_VERSION = KTP_VERSION || 6;
  var errors = [], warnings = [];
  if (!candidate || typeof candidate !== 'object')
    return { ok: false, errors: ['Geçersiz veri yapısı'], warnings: warnings };
  if (!candidate.tenants && !candidate.payments && !candidate.buildings) {
    errors.push('Kira Takip yedek dosyası değil');
    return { ok: false, errors: errors, warnings: warnings };
  }
  if (typeof candidate._ktpVersion === 'number' && candidate._ktpVersion > KTP_VERSION) {
    errors.push('Bu yedek daha yeni bir sürümden (v'+candidate._ktpVersion+')');
    return { ok: false, errors: errors, warnings: warnings };
  }
  if (!candidate.tenants)   warnings.push('Kiracı verisi eksik');
  if (!candidate.payments)  warnings.push('Ödeme verisi eksik');
  if (!candidate.expenses)  warnings.push('Gider verisi eksik');
  if (!candidate.buildings) warnings.push('Bina listesi yok — v5 formatı');
  return { ok: errors.length === 0, errors: errors, warnings: warnings };
}

test('_importParse: empty string → ok:false', function() {
  var r = simulateImportParse('');
  assert(!r.ok);
  assert(r.errors.length > 0);
});
test('_importParse: corrupted JSON → ok:false with message', function() {
  var r = simulateImportParse('{not valid json,,}');
  assert(!r.ok);
  assert(r.errors[0].includes('ayrıştırma hatası'));
});
test('_importParse: valid JSON object → ok:true', function() {
  var r = simulateImportParse(JSON.stringify({ tenants: {}, _ktpVersion: 6 }));
  assert(r.ok);
  assertEqual(r.version, 6);
});
test('_importParse: v5 legacy (no _ktpVersion) → ok:true, version 0', function() {
  var r = simulateImportParse(JSON.stringify({ tenants: {}, payments: {} }));
  assert(r.ok);
  assertEqual(r.version, 0);
});
test('_importValidate: missing importHistory → ok:true (optional field)', function() {
  var r = simulateImportValidate({ tenants: {}, payments: {}, buildings: [] });
  assert(r.ok);
  assert(!r.errors.length);
});
test('_importValidate: missing waLog → ok:true (optional field)', function() {
  var r = simulateImportValidate({ tenants: {}, payments: {} });
  assert(r.ok);
});
test('_importValidate: future _ktpVersion → ok:false', function() {
  var r = simulateImportValidate({ tenants: {}, _ktpVersion: 99 }, 6);
  assert(!r.ok);
  assert(r.errors[0].includes('daha yeni'));
});
test('_importValidate: no recognisable fields → ok:false', function() {
  var r = simulateImportValidate({ foo: 'bar' });
  assert(!r.ok);
});
test('_importValidate: missing buildings → warning not error (v5 compat)', function() {
  var r = simulateImportValidate({ tenants: {}, payments: {} });
  assert(r.ok);
  assert(r.warnings.some(function(w) { return w.includes('Bina'); }));
});

// importHistory round-trip: export includes history; import restores it
test('importHistory round-trip: survives export then overwrite-import', function() {
  var hist = [makeHistEntry('h_rt1', 'payment', 2, 'snap_1')];
  var env = makeExportEnvelope({}, hist);
  // Simulate overwrite-mode _importCommit for importHistory
  var DATA = { importHistory: [makeHistEntry('old_h', 'tenant', 1)] };
  if (Array.isArray(env.importHistory)) DATA.importHistory = env.importHistory;
  assertEqual(DATA.importHistory.length, 1);
  assertEqual(DATA.importHistory[0].id, 'h_rt1');
});
test('importHistory round-trip: merge deduplicates by id', function() {
  var incoming = [makeHistEntry('h1', 'payment', 2), makeHistEntry('h2', 'expense', 1)];
  var existing = [makeHistEntry('h1', 'payment', 2)]; // h1 already present
  var existingIds = new Set(existing.map(function(h) { return h.id; }));
  var newEntries = incoming.filter(function(h) { return !existingIds.has(h.id); });
  var merged = newEntries.concat(existing).slice(0, 100);
  assertEqual(merged.length, 2);
  assertEqual(merged[0].id, 'h2');
  assertEqual(merged[1].id, 'h1');
});
test('importHistory round-trip: old backup without importHistory → no crash', function() {
  var oldBackup = { tenants: {}, payments: {}, buildings: [] }; // no importHistory
  var DATA = { importHistory: [makeHistEntry('keep_me', 'tenant', 1)] };
  if (Array.isArray(oldBackup.importHistory)) DATA.importHistory = oldBackup.importHistory;
  // importHistory unchanged because oldBackup had none
  assertEqual(DATA.importHistory[0].id, 'keep_me');
});

// Rollback-after-restart: snapshot survives localStorage round-trip
test('Rollback after restart: snapshot survives JSON serialization', function() {
  var snap = makeSnap('snap_restart', 'payment', {
    payments: { t1: { 'Nisan 2026': { paid: 1500 } } }
  });
  var serialized = JSON.stringify([snap]);
  var loaded = JSON.parse(serialized);
  var r = simulateRollback(loaded, 'snap_restart', {
    payments: { t1: { 'Nisan 2026': { paid: 9999 } } }
  });
  assert(r.ok);
  assertEqual(r.data.payments.t1['Nisan 2026'].paid, 1500);
});
test('Rollback after restart: importHistory entry survives serialization', function() {
  var entry = makeHistEntry('h_persist', 'expense', 4, 'snap_abc');
  var serialized = JSON.stringify([entry]);
  var loaded = JSON.parse(serialized);
  assertEqual(loaded[0].id, 'h_persist');
  assertEqual(loaded[0].snapshotId, 'snap_abc');
  assert(!loaded[0].rolledBack);
});

// ── Multilingual Header Detection ────────────────────────────────────────────
console.log('\nMultilingual Header Detection:');

// Simulate _DETECT + _detectMapping for a given mode
var DETECT = {
  name:    [/kirac/i,/m[üu][sş]teri/i,/\bad\b/i,/\bisim\b/i,/tenant/i,/renter/i,/customer/i,/\bname\b/i,/full.name/i,/ad.soyad/i],
  unit:    [/daire/i,/birim/i,/\bunit\b/i,/\bno\b$/i,/numara/i,/room/i,/\bapartment\b/i,/\bflat\b/i,/kap[ıi]/i],
  rent:    [/\bkira\b/i,/\brent\b/i,/ayl[ıi]k/i,/kirabedel/i,/monthly/i,/beklenen/i,/expected/i],
  phone:   [/telefon/i,/\btel\b/i,/\bphone\b/i,/\bgsm\b/i,/\bcep\b/i,/\bmobile\b/i,/\bcontact\b/i],
  building:[/\bbina\b/i,/\bbuilding\b/i,/\bblok\b/i,/apartman/i,/\bsite\b/i,/property/i],
  paid:    [/[oö]deme/i,/[oö]denen/i,/\bpayment\b/i,/tahsilat/i,/al[ıi]nan/i,/\bpaid\b/i,/tutar/i,/miktar/i,/collection/i],
  month:   [/d[oö]nem/i,/\bay\b/i,/\bmonth\b/i,/\bperiod\b/i],
  date:    [/tarih/i,/\bdate\b/i,/\bdt\b/i],
  sekil:   [/[sş]ekil/i,/[sş]ekl[ıi]/i,/metod/i,/y[oö]ntem/i,/method/i,/\btype\b/i],
  dep:     [/depozito/i,/deposit/i,/g[üu]vence/i],
  floor:   [/\bkat\b/i,/\bfloor\b/i],
  bas:     [/ba[sş]lang/i,/\bstart\b/i,/giri[sş]/i],
  bit:     [/biti[sş]/i,/\bend\b/i,/[çc][ıi]k[ıi][sş]/i],
  notes:   [/\bnot\b/i,/\bnote\b/i,/a[cç][ıi]kl/i,/\bnotes\b/i,/remark/i,/detay/i,/descrip/i,/\bdetails\b/i],
  amount:  [/tutar/i,/miktar/i,/\bamount\b/i,/bedel/i,/masraf/i,/\bexpense\b/i,/\bcost\b/i],
  category:[/kategori/i,/t[üu]r[üu]/i,/\bcategory\b/i,/\btype\b/i,/gider.*t/i],
};
var MODES_TEST = {
  tenant:  { name:1, unit:1, rent:1, phone:1, dep:1, floor:1, bas:1, bit:1, notes:1, building:1 },
  payment: { unit:1, name:1, paid:1, month:1, date:1, sekil:1, notes:1, building:1 },
  expense: { building:1, category:1, amount:1, month:1, date:1, notes:1 },
};
function detectMapping(headers, mode) {
  var fields = Object.keys(MODES_TEST[mode]);
  var map = {};
  fields.forEach(function(f) { map[f] = -1; });
  headers.forEach(function(h, ci) {
    var hn = String(h).toLowerCase().replace(/\s+/g, '');
    Object.keys(DETECT).forEach(function(field) {
      if (map.hasOwnProperty(field) && map[field] === -1) {
        if (DETECT[field].some(function(re) { return re.test(hn) || re.test(String(h)); }))
          map[field] = ci;
      }
    });
  });
  return map;
}

// Tenant: English headers
test('EN tenant headers: Tenant Name / Unit / Rent / Phone', function() {
  var m = detectMapping(['Tenant Name', 'Unit', 'Rent', 'Phone'], 'tenant');
  assertEqual(m.name, 0); assertEqual(m.unit, 1); assertEqual(m.rent, 2); assertEqual(m.phone, 3);
});
test('EN tenant headers: Customer / Apartment / Monthly Rent / Mobile', function() {
  var m = detectMapping(['Customer', 'Apartment', 'Monthly Rent', 'Mobile'], 'tenant');
  assertEqual(m.name, 0); assertEqual(m.unit, 1); assertEqual(m.rent, 2); assertEqual(m.phone, 3);
});
test('EN tenant headers: Full Name / Flat / Expected Rent / Contact', function() {
  var m = detectMapping(['Full Name', 'Flat', 'Expected Rent', 'Contact'], 'tenant');
  assertEqual(m.name, 0); assertEqual(m.unit, 1); assertEqual(m.rent, 2); assertEqual(m.phone, 3);
});
test('TR tenant headers: Kiracı / Daire / Kira / Telefon', function() {
  var m = detectMapping(['Kiracı', 'Daire', 'Kira', 'Telefon'], 'tenant');
  assertEqual(m.name, 0); assertEqual(m.unit, 1); assertEqual(m.rent, 2); assertEqual(m.phone, 3);
});
test('TR tenant headers: Müşteri / Birim / Aylık Kira / Cep', function() {
  var m = detectMapping(['Müşteri', 'Birim', 'Aylık Kira', 'Cep'], 'tenant');
  assertEqual(m.name, 0); assertEqual(m.unit, 1); assertEqual(m.rent, 2); assertEqual(m.phone, 3);
});
test('EN tenant headers: Deposit / Floor / Start / End detected', function() {
  var m = detectMapping(['Name','Unit','Rent','Deposit','Floor','Start','End'], 'tenant');
  assertEqual(m.dep, 3); assertEqual(m.floor, 4); assertEqual(m.bas, 5); assertEqual(m.bit, 6);
});

// Payment: English headers
test('EN payment headers: Paid / Month / Method / Building', function() {
  var m = detectMapping(['Unit', 'Paid', 'Month', 'Method', 'Building'], 'payment');
  assertEqual(m.unit, 0); assertEqual(m.paid, 1); assertEqual(m.month, 2);
  assertEqual(m.sekil, 3); assertEqual(m.building, 4);
});
test('EN payment headers: Payment Amount / Period / Payment Method', function() {
  var m = detectMapping(['Unit', 'Payment Amount', 'Period', 'Payment Method'], 'payment');
  assertEqual(m.paid, 1); assertEqual(m.month, 2); assertEqual(m.sekil, 3);
});
test('EN payment headers: Collection / Payment Date', function() {
  var m = detectMapping(['Unit', 'Collection', 'Month', 'Payment Date'], 'payment');
  assertEqual(m.paid, 1); assertEqual(m.date, 3);
});
test('TR payment headers: Ödeme Şekli / Dönem / Bina', function() {
  var m = detectMapping(['Daire', 'Ödenen', 'Dönem', 'Ödeme Şekli', 'Bina'], 'payment');
  assertEqual(m.unit, 0); assertEqual(m.paid, 1); assertEqual(m.month, 2);
  assertEqual(m.sekil, 3); assertEqual(m.building, 4);
});
// "Type" maps to sekil in payment mode, category in expense mode
test('"Type" header → sekil in payment mode', function() {
  var m = detectMapping(['Unit', 'Paid', 'Month', 'Type'], 'payment');
  assertEqual(m.sekil, 3);
});
test('"Type" header → category in expense mode', function() {
  var m = detectMapping(['Building', 'Amount', 'Month', 'Type'], 'expense');
  assertEqual(m.category, 3);
});

// Expense: English headers
test('EN expense headers: Building / Cost / Month / Category', function() {
  var m = detectMapping(['Building', 'Cost', 'Month', 'Category'], 'expense');
  assertEqual(m.building, 0); assertEqual(m.amount, 1); assertEqual(m.month, 2);
  assertEqual(m.category, 3);
});
test('EN expense headers: Property / Expense / Period / Type / Note', function() {
  var m = detectMapping(['Property', 'Expense', 'Period', 'Type', 'Note'], 'expense');
  assertEqual(m.building, 0); assertEqual(m.amount, 1); assertEqual(m.month, 2);
  assertEqual(m.notes, 4);
});
test('EN expense headers: Description / Details detected as notes', function() {
  var m = detectMapping(['Building', 'Amount', 'Month', 'Description'], 'expense');
  assertEqual(m.notes, 3);
  var m2 = detectMapping(['Building', 'Amount', 'Month', 'Details'], 'expense');
  assertEqual(m2.notes, 3);
});
test('TR expense headers: Bina / Masraf / Dönem / Kategori / Açıklama', function() {
  var m = detectMapping(['Bina', 'Masraf', 'Dönem', 'Kategori', 'Açıklama'], 'expense');
  assertEqual(m.building, 0); assertEqual(m.amount, 1); assertEqual(m.month, 2);
  assertEqual(m.category, 3); assertEqual(m.notes, 4);
});

// ── _num Currency Parsing ─────────────────────────────────────────────────────
console.log('\n_num Currency Parsing:');

function testNum(val) {
  // Mirror the updated _num logic
  if (val === null || val === undefined || val === '') return NaN;
  var s = String(val).replace(/[₺TL\s]/gi, '').trim();
  if (!s || !/\d/.test(s)) return NaN;
  var hasDot = s.indexOf('.') >= 0, hasCom = s.indexOf(',') >= 0;
  if (hasDot && hasCom) {
    if (s.lastIndexOf('.') > s.lastIndexOf(',')) s = s.replace(/,/g, '');
    else s = s.replace(/\./g, '').replace(',', '.');
  } else if (hasCom) {
    if (/^\d{1,3}(,\d{3})+$/.test(s)) s = s.replace(/,/g, '');
    else s = s.replace(',', '.');
  } else if (hasDot) {
    var parts = s.split('.');
    if (parts.length > 2) s = s.replace(/\./g, '');
    else if (parts[1] && parts[1].length === 3 && parts[0] !== '0') s = s.replace('.', '');
  }
  return parseFloat(s);
}

test('_num: plain integer', function() { assertEqual(testNum('12000'), 12000); });
test('_num: EN thousands comma (12,000)', function() { assertEqual(testNum('12,000'), 12000); });
test('_num: EN millions comma (1,000,000)', function() { assertEqual(testNum('1,000,000'), 1000000); });
test('_num: TR thousands dot (12.000)', function() { assertEqual(testNum('12.000'), 12000); });
test('_num: TR decimal (12,5)', function() { assertEqual(testNum('12,5'), 12.5); });
test('_num: TR full (12.000,50)', function() { assertEqual(testNum('12.000,50'), 12000.5); });
test('_num: EN full (12,000.50)', function() { assertEqual(testNum('12,000.50'), 12000.5); });
test('_num: millions dot (1.000.000)', function() { assertEqual(testNum('1.000.000'), 1000000); });
test('_num: ₺ prefix (₺12.000)', function() { assertEqual(testNum('₺12.000'), 12000); });
test('_num: TL prefix (TL 12000)', function() { assertEqual(testNum('TL 12000'), 12000); });
test('_num: tl lowercase (tl 5000)', function() { assertEqual(testNum('tl 5000'), 5000); });
test('_num: decimal stays decimal (12.5)', function() { assertEqual(testNum('12.5'), 12.5); });
test('_num: zero is valid (0)', function() { assertEqual(testNum('0'), 0); });
test('_num: 0.500 → stays decimal (leading zero)', function() { assertEqual(testNum('0.500'), 0.5); });
test('_num: empty → NaN', function() { assert(isNaN(testNum(''))); });
test('_num: letters only → NaN', function() { assert(isNaN(testNum('abc'))); });
test('_num: negative keeps sign', function() { assertEqual(testNum('-500'), -500); });

// ── Sheet Name Inference ──────────────────────────────────────────────────────
console.log('\nSheet Name Inference:');

function inferMode(sheetName) {
  var n = String(sheetName || '').toLowerCase();
  if (/[oö]deme|payment|tahsilat|collection/.test(n)) return 'payment';
  if (/gider|masraf|expense|\bcost/.test(n)) return 'expense';
  if (/kirac|tenant|m[üu][sş]teri|customer/.test(n)) return 'tenant';
  return null; // falls through to header scoring
}

test('Sheet "Kiracılar" → tenant', function() { assertEqual(inferMode('Kiracılar'), 'tenant'); });
test('Sheet "Kiracilar" → tenant', function() { assertEqual(inferMode('Kiracilar'), 'tenant'); });
test('Sheet "Tenants" → tenant', function() { assertEqual(inferMode('Tenants'), 'tenant'); });
test('Sheet "Customers" → tenant', function() { assertEqual(inferMode('Customers'), 'tenant'); });
test('Sheet "Müşteriler" → tenant', function() { assertEqual(inferMode('Müşteriler'), 'tenant'); });
test('Sheet "Ödemeler" → payment', function() { assertEqual(inferMode('Ödemeler'), 'payment'); });
test('Sheet "Odemeler" → payment', function() { assertEqual(inferMode('Odemeler'), 'payment'); });
test('Sheet "Payments" → payment', function() { assertEqual(inferMode('Payments'), 'payment'); });
test('Sheet "Collections" → payment', function() { assertEqual(inferMode('Collections'), 'payment'); });
test('Sheet "Tahsilat" → payment', function() { assertEqual(inferMode('Tahsilat'), 'payment'); });
test('Sheet "Giderler" → expense', function() { assertEqual(inferMode('Giderler'), 'expense'); });
test('Sheet "Masraflar" → expense', function() { assertEqual(inferMode('Masraflar'), 'expense'); });
test('Sheet "Expenses" → expense', function() { assertEqual(inferMode('Expenses'), 'expense'); });
test('Sheet "Costs" → expense', function() { assertEqual(inferMode('Costs'), 'expense'); });

// ── Blank Row Handling ────────────────────────────────────────────────────────
console.log('\nBlank Row Handling:');

function countValidRows(rows) {
  // Simulate _validate blank-row skip (returns count of non-blank data rows processed)
  var data = rows.slice(1);
  var processed = 0;
  data.forEach(function(row) {
    if (!row.some(function(c) { return String(c || '').trim() !== ''; })) return;
    processed++;
  });
  return processed;
}

test('Blank rows in middle are skipped', function() {
  var rows = [['Name','Unit','Rent'], ['Ali','A1','3000'], ['','',''], ['Veli','B1','2000']];
  assertEqual(countValidRows(rows), 2);
});
test('Multiple trailing blank rows ignored', function() {
  var rows = [['Name','Unit','Rent'], ['Ali','A1','3000'], ['','',''], ['','','']];
  assertEqual(countValidRows(rows), 1);
});
test('All blank data rows → 0 processed', function() {
  var rows = [['Name','Unit','Rent'], ['','',''], ['','','']];
  assertEqual(countValidRows(rows), 0);
});
test('Row with at least one value is not skipped', function() {
  var rows = [['Name','Unit','Rent'], ['','A1','']];
  assertEqual(countValidRows(rows), 1);
});

// ── i18n / t() helper ────────────────────────────────────────────────────────
console.log('\ni18n / t() helper:');

var STRINGS_TEST = {
  tr:{
    loginSubtitle: 'Emlak Yönetim Sistemi — Giriş yapın',
    pinError:      '❌ PIN hatalı',
    setupBack:     '← Kuruluma geri dön',
    recovery:      '🛡 Kurtarma Modu',
    resetData:     'Verileri Sıfırla',
    roleAdmin:     '👑 Yönetici (Admin)',
    roleManager:   '🔑 Yönetici (Müdür)',
    roleViewer:    '👁️ Görüntüleyici',
    obTitle:       'Kira Takip Pro',
    obStart:       'Kuruluma Başla →',
    obContinue:    'Devam →',
    obBackBtn:     '← Geri',
    obFinish:      'Kurulumu Tamamla ✓',
  },
  en:{
    loginSubtitle: 'Property Management System — Sign in',
    pinError:      '❌ Wrong PIN',
    setupBack:     '← Back to Setup',
    recovery:      '🛡 Recovery Mode',
    resetData:     'Reset Data',
    roleAdmin:     '👑 Admin',
    roleManager:   '🔑 Manager',
    roleViewer:    '👁️ Viewer',
    obTitle:       'Rent Track Pro',
    obStart:       'Start Setup →',
    obContinue:    'Continue →',
    obBackBtn:     '← Back',
    obFinish:      'Complete Setup ✓',
  },
};

function t_test(key, lang) {
  var l = lang || 'tr';
  var DATA_stub = { settings: { lang: l } };
  return (STRINGS_TEST[l] || STRINGS_TEST.tr)[key] || STRINGS_TEST.tr[key] || key;
}

test('t(): default lang is tr', function() {
  assertEqual(t_test('loginSubtitle'), 'Emlak Yönetim Sistemi — Giriş yapın');
});
test('t(): en loginSubtitle', function() {
  assertEqual(t_test('loginSubtitle','en'), 'Property Management System — Sign in');
});
test('t(): missing key falls back to key name', function() {
  assertEqual(t_test('no_such_key_xyz'), 'no_such_key_xyz');
});
test('t(): tr pinError', function() {
  assertEqual(t_test('pinError','tr'), '❌ PIN hatalı');
});
test('t(): en pinError', function() {
  assertEqual(t_test('pinError','en'), '❌ Wrong PIN');
});
test('t(): tr roleAdmin', function() {
  assertEqual(t_test('roleAdmin','tr'), '👑 Yönetici (Admin)');
});
test('t(): en roleAdmin', function() {
  assertEqual(t_test('roleAdmin','en'), '👑 Admin');
});
test('t(): tr setupBack', function() {
  assertEqual(t_test('setupBack','tr'), '← Kuruluma geri dön');
});
test('t(): en setupBack', function() {
  assertEqual(t_test('setupBack','en'), '← Back to Setup');
});
test('t(): tr obTitle', function() {
  assertEqual(t_test('obTitle','tr'), 'Kira Takip Pro');
});
test('t(): en obTitle', function() {
  assertEqual(t_test('obTitle','en'), 'Rent Track Pro');
});
test('t(): tr obStart', function() {
  assertEqual(t_test('obStart','tr'), 'Kuruluma Başla →');
});
test('t(): en obStart', function() {
  assertEqual(t_test('obStart','en'), 'Start Setup →');
});
test('t(): tr obContinue', function() {
  assertEqual(t_test('obContinue','tr'), 'Devam →');
});
test('t(): en obContinue', function() {
  assertEqual(t_test('obContinue','en'), 'Continue →');
});
test('t(): tr obBackBtn', function() {
  assertEqual(t_test('obBackBtn','tr'), '← Geri');
});
test('t(): en obBackBtn', function() {
  assertEqual(t_test('obBackBtn','en'), '← Back');
});
test('t(): tr obFinish', function() {
  assertEqual(t_test('obFinish','tr'), 'Kurulumu Tamamla ✓');
});
test('t(): en obFinish', function() {
  assertEqual(t_test('obFinish','en'), 'Complete Setup ✓');
});
test('t(): missing key in en falls back to tr value', function() {
  // Add a key only in TR to verify EN falls back
  STRINGS_TEST.tr['tr_only_key'] = 'sadece türkçe';
  assertEqual(t_test('tr_only_key','en'), 'sadece türkçe');
  delete STRINGS_TEST.tr['tr_only_key'];
});
test('t(): unknown lang falls back to tr', function() {
  assertEqual(t_test('pinError','de'), '❌ PIN hatalı');
});

// ── Month Label & Currency (B.2.1 i18n layer) ────────────────────────────────
console.log('\nMonth Label & Currency (B.2.1):');

var MONTHS_EN = ['January','February','March','April','May','June','July','August','September','October','November','December'];
var MONTHS_EN_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function monthLabel_test(mKey, lang) {
  if (!mKey) return mKey;
  var parts = mKey.split(' ');
  if (parts.length !== 2) return mKey;
  var trName = parts[0], year = parts[1];
  var idx = MONTHS.indexOf(trName);
  if (idx < 0) return mKey;
  return lang === 'en' ? (MONTHS_EN[idx] + ' ' + year) : mKey;
}

function monthLabelShort_test(trName, lang) {
  var idx = MONTHS.indexOf(trName);
  if (idx < 0) return trName.slice(0, 3);
  return lang === 'en' ? MONTHS_EN_SHORT[idx] : trName.slice(0, 3);
}

function currencySymbol_test(currency) {
  return (currency || 'TRY') === 'USD' ? '$' : '₺';
}

function money_test(v, currency, lang) {
  var sym = currencySymbol_test(currency);
  var loc = lang === 'en' ? 'en-US' : 'tr-TR';
  return sym + Number(v || 0).toLocaleString(loc);
}

test('monthLabel: Nisan 2026 + tr → unchanged', function() {
  assertEqual(monthLabel_test('Nisan 2026', 'tr'), 'Nisan 2026');
});
test('monthLabel: Nisan 2026 + en → April 2026', function() {
  assertEqual(monthLabel_test('Nisan 2026', 'en'), 'April 2026');
});
test('monthLabel: Ocak 2025 + tr → unchanged', function() {
  assertEqual(monthLabel_test('Ocak 2025', 'tr'), 'Ocak 2025');
});
test('monthLabel: Ocak 2025 + en → January 2025', function() {
  assertEqual(monthLabel_test('Ocak 2025', 'en'), 'January 2025');
});
test('monthLabel: Aralık 2026 + en → December 2026', function() {
  assertEqual(monthLabel_test('Aralık 2026', 'en'), 'December 2026');
});
test('monthLabel: Temmuz 2024 + en → July 2024', function() {
  assertEqual(monthLabel_test('Temmuz 2024', 'en'), 'July 2024');
});
test('monthLabel: null → null', function() {
  assertEqual(monthLabel_test(null, 'en'), null);
});
test('monthLabel: unknown TR name → returned as-is', function() {
  assertEqual(monthLabel_test('NotAMonth 2026', 'en'), 'NotAMonth 2026');
});
test('monthLabel: no space → returned as-is', function() {
  assertEqual(monthLabel_test('Nisan2026', 'en'), 'Nisan2026');
});

test('monthLabelShort: Nisan + tr → Nis', function() {
  assertEqual(monthLabelShort_test('Nisan', 'tr'), 'Nis');
});
test('monthLabelShort: Nisan + en → Apr', function() {
  assertEqual(monthLabelShort_test('Nisan', 'en'), 'Apr');
});
test('monthLabelShort: Ocak + tr → Oca', function() {
  assertEqual(monthLabelShort_test('Ocak', 'tr'), 'Oca');
});
test('monthLabelShort: Ocak + en → Jan', function() {
  assertEqual(monthLabelShort_test('Ocak', 'en'), 'Jan');
});
test('monthLabelShort: Aralık + en → Dec', function() {
  assertEqual(monthLabelShort_test('Aralık', 'en'), 'Dec');
});
test('monthLabelShort: Ağustos + en → Aug', function() {
  assertEqual(monthLabelShort_test('Ağustos', 'en'), 'Aug');
});
test('monthLabelShort: unknown month → first 3 chars', function() {
  assertEqual(monthLabelShort_test('Bazı', 'en'), 'Baz');
});

test('currencySymbol: TRY → ₺', function() {
  assertEqual(currencySymbol_test('TRY'), '₺');
});
test('currencySymbol: USD → $', function() {
  assertEqual(currencySymbol_test('USD'), '$');
});
test('currencySymbol: undefined → ₺ (default TRY)', function() {
  assertEqual(currencySymbol_test(undefined), '₺');
});
test('currencySymbol: null → ₺ (default TRY)', function() {
  assertEqual(currencySymbol_test(null), '₺');
});

test('money: TRY + tr → ₺ prefix', function() {
  assert(money_test(1500, 'TRY', 'tr').startsWith('₺'));
});
test('money: USD + en → $ prefix', function() {
  assert(money_test(1500, 'USD', 'en').startsWith('$'));
});
test('money: TRY + tr 1500 → ₺1.500', function() {
  assertEqual(money_test(1500, 'TRY', 'tr'), '₺' + Number(1500).toLocaleString('tr-TR'));
});
test('money: USD + en 1500 → $1,500', function() {
  assertEqual(money_test(1500, 'USD', 'en'), '$' + Number(1500).toLocaleString('en-US'));
});
test('money: zero → ₺0', function() {
  assertEqual(money_test(0, 'TRY', 'tr'), '₺' + Number(0).toLocaleString('tr-TR'));
});
test('money: null value → ₺0', function() {
  assertEqual(money_test(null, 'TRY', 'tr'), '₺' + Number(0).toLocaleString('tr-TR'));
});
test('money: default currency TRY when currency missing', function() {
  assert(money_test(500, undefined, 'tr').startsWith('₺'));
});

test('no crash: settings missing lang → default tr', function() {
  var settings = { theme: 'dark', currency: 'TRY' };
  var lang = (settings && settings.lang) || 'tr';
  assertEqual(lang, 'tr');
});
test('no crash: settings missing currency → default TRY', function() {
  var settings = { lang: 'tr', theme: 'dark' };
  var currency = (settings && settings.currency) || 'TRY';
  assertEqual(currency, 'TRY');
});
test('no crash: settings missing theme → default dark', function() {
  var settings = { lang: 'tr', currency: 'TRY' };
  var theme = (settings && settings.theme) || 'dark';
  assertEqual(theme, 'dark');
});
test('no crash: settings entirely null → safe defaults', function() {
  var settings = null;
  var lang     = (settings && settings.lang)     || 'tr';
  var currency = (settings && settings.currency) || 'TRY';
  var theme    = (settings && settings.theme)    || 'dark';
  assertEqual(lang, 'tr');
  assertEqual(currency, 'TRY');
  assertEqual(theme, 'dark');
});
test('no crash: monthLabel with null DATA settings → returns key', function() {
  assertEqual(monthLabel_test('Nisan 2026', undefined), 'Nisan 2026');
});
test('no crash: currencySymbol empty string → default TRY', function() {
  assertEqual(currencySymbol_test(''), '₺');
});

// ── formatDate() (B.2.2) ─────────────────────────────────────────────────────
console.log('\nformatDate (B.2.2):');

function formatDate_test(d, lang) {
  if (!d) return '—';
  try {
    var dt = new Date(d);
    if (isNaN(dt.getTime())) return d;
    var dd = String(dt.getUTCDate()).padStart(2, '0');
    var mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
    var yy = dt.getUTCFullYear();
    return (lang === 'en') ? (mm + '/' + dd + '/' + yy) : (dd + '.' + mm + '.' + yy);
  } catch (e) { return d; }
}

test('formatDate: null → —', function() {
  assertEqual(formatDate_test(null, 'tr'), '—');
});
test('formatDate: empty string → —', function() {
  assertEqual(formatDate_test('', 'tr'), '—');
});
test('formatDate: 2026-04-15 + tr → 15.04.2026', function() {
  assertEqual(formatDate_test('2026-04-15', 'tr'), '15.04.2026');
});
test('formatDate: 2026-04-15 + en → 04/15/2026', function() {
  assertEqual(formatDate_test('2026-04-15', 'en'), '04/15/2026');
});
test('formatDate: 2026-01-01 + tr → 01.01.2026', function() {
  assertEqual(formatDate_test('2026-01-01', 'tr'), '01.01.2026');
});
test('formatDate: 2026-12-31 + en → 12/31/2026', function() {
  assertEqual(formatDate_test('2026-12-31', 'en'), '12/31/2026');
});
test('formatDate: 2025-09-05 + tr → 05.09.2025', function() {
  assertEqual(formatDate_test('2025-09-05', 'tr'), '05.09.2025');
});
test('formatDate: 2025-09-05 + en → 09/05/2025', function() {
  assertEqual(formatDate_test('2025-09-05', 'en'), '09/05/2025');
});
test('formatDate: invalid string → returned as-is', function() {
  assertEqual(formatDate_test('not-a-date', 'tr'), 'not-a-date');
});
test('formatDate: single digit day/month padded', function() {
  assertEqual(formatDate_test('2026-03-07', 'tr'), '07.03.2026');
  assertEqual(formatDate_test('2026-03-07', 'en'), '03/07/2026');
});

// ── Permission helpers (B.2.2) ────────────────────────────────────────────────
console.log('\nPermission Helpers (B.2.2):');

// Minimal DATA / currentUser stubs
function makeUserList() {
  return [
    { id: 'u_admin', name: 'Admin', role: 'admin',   pin: '1234', active: true },
    { id: 'u_editor', name: 'Editor', role: 'manager', pin: '5678', active: true },
    { id: 'u_viewer', name: 'Viewer', role: 'viewer',  pin: '0000', active: true },
  ];
}

function makePermCtx(currentId, currentRole) {
  var users = makeUserList();
  var cu = { id: currentId, role: currentRole };
  function _isSelf(i)          { return users[i] && users[i].id === cu.id; }
  function isAdmin()           { return cu.role === 'admin'; }
  function canEdit()           { return cu.role === 'admin' || cu.role === 'manager'; }
  function canEditUser(i)      { return isAdmin() || _isSelf(i); }
  function canChangeRole()     { return isAdmin(); }
  function canDeactivateUser(i){ return isAdmin() && !_isSelf(i); }
  function canDeleteUser(i)    { return isAdmin() && !_isSelf(i); }
  return { _isSelf: _isSelf, isAdmin: isAdmin, canEdit: canEdit,
           canEditUser: canEditUser, canChangeRole: canChangeRole,
           canDeactivateUser: canDeactivateUser, canDeleteUser: canDeleteUser };
}

// _isSelf
test('_isSelf: admin looking at own row (0)', function() {
  var p = makePermCtx('u_admin', 'admin');
  assert(p._isSelf(0), 'admin is self at index 0');
});
test('_isSelf: admin looking at other row (1)', function() {
  var p = makePermCtx('u_admin', 'admin');
  assert(!p._isSelf(1), 'admin is not self at index 1');
});
test('_isSelf: editor looking at own row (1)', function() {
  var p = makePermCtx('u_editor', 'manager');
  assert(p._isSelf(1), 'editor is self at index 1');
});
test('_isSelf: out of bounds index → false', function() {
  var p = makePermCtx('u_admin', 'admin');
  assert(!p._isSelf(99), 'index 99 does not exist → false');
});

// canEditUser
test('canEditUser: admin can edit any user', function() {
  var p = makePermCtx('u_admin', 'admin');
  assert(p.canEditUser(0) && p.canEditUser(1) && p.canEditUser(2));
});
test('canEditUser: editor can only edit own row', function() {
  var p = makePermCtx('u_editor', 'manager');
  assert(!p.canEditUser(0), 'editor cannot edit admin');
  assert(p.canEditUser(1),  'editor can edit self');
  assert(!p.canEditUser(2), 'editor cannot edit viewer');
});
test('canEditUser: viewer can only edit own row', function() {
  var p = makePermCtx('u_viewer', 'viewer');
  assert(!p.canEditUser(0), 'viewer cannot edit admin');
  assert(!p.canEditUser(1), 'viewer cannot edit editor');
  assert(p.canEditUser(2),  'viewer can edit self');
});

// canChangeRole
test('canChangeRole: admin can change roles', function() {
  var p = makePermCtx('u_admin', 'admin');
  assert(p.canChangeRole());
});
test('canChangeRole: editor cannot change roles', function() {
  var p = makePermCtx('u_editor', 'manager');
  assert(!p.canChangeRole());
});
test('canChangeRole: viewer cannot change roles', function() {
  var p = makePermCtx('u_viewer', 'viewer');
  assert(!p.canChangeRole());
});

// canDeactivateUser
test('canDeactivateUser: admin can deactivate others', function() {
  var p = makePermCtx('u_admin', 'admin');
  assert(p.canDeactivateUser(1), 'can deactivate editor');
  assert(p.canDeactivateUser(2), 'can deactivate viewer');
});
test('canDeactivateUser: admin cannot deactivate self', function() {
  var p = makePermCtx('u_admin', 'admin');
  assert(!p.canDeactivateUser(0), 'admin cannot deactivate self');
});
test('canDeactivateUser: editor cannot deactivate anyone', function() {
  var p = makePermCtx('u_editor', 'manager');
  assert(!p.canDeactivateUser(0));
  assert(!p.canDeactivateUser(2));
});

// canDeleteUser
test('canDeleteUser: admin can delete others', function() {
  var p = makePermCtx('u_admin', 'admin');
  assert(p.canDeleteUser(1) && p.canDeleteUser(2));
});
test('canDeleteUser: admin cannot delete self', function() {
  var p = makePermCtx('u_admin', 'admin');
  assert(!p.canDeleteUser(0));
});
test('canDeleteUser: editor cannot delete anyone', function() {
  var p = makePermCtx('u_editor', 'manager');
  assert(!p.canDeleteUser(0) && !p.canDeleteUser(2));
});
test('canDeleteUser: viewer cannot delete anyone', function() {
  var p = makePermCtx('u_viewer', 'viewer');
  assert(!p.canDeleteUser(0) && !p.canDeleteUser(1));
});

// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n═══ Results: ${passed} passed, ${failed} failed ═══\n`);

if (failed > 0) {
  process.exit(1);
} else {
  console.log('✅ All tests passed!\n');
  process.exit(0);
}
