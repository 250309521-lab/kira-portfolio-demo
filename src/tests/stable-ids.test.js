'use strict';

/**
 * Stable IDs Migration Tests — PRE-WORK-1
 *
 * Standalone:  node src/tests/stable-ids.test.js
 * Via run.js:  require('./stable-ids.test.js').register(test, assert, assertEqual)
 *
 * Tests the _newId / _stampExpenseIds / _ensureWorkspaceId behaviour
 * extracted from renderer.html logic. No DOM, no Electron.
 */

// ── Inline copies of the three utility functions from renderer.html ──────────

function _newId() {
  // In Node.js use crypto.randomUUID(); in test env use the same fallback path.
  try {
    var c = require('crypto');
    if (c.randomUUID) return c.randomUUID();
  } catch (e) {}
  return 'id_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
}

function _stampExpenseIds(expenses) {
  var stamped = 0;
  if (!expenses || typeof expenses !== 'object') return 0;
  Object.keys(expenses).forEach(function (bld) {
    var byMonth = expenses[bld];
    if (!byMonth || typeof byMonth !== 'object') return;
    Object.keys(byMonth).forEach(function (mo) {
      try {
        var arr = byMonth[mo];
        if (!Array.isArray(arr)) return;
        arr.forEach(function (item) {
          if (item && typeof item === 'object' && !item.id) { item.id = _newId(); stamped++; }
        });
      } catch (e2) {}
    });
  });
  return stamped;
}

function _ensureWorkspaceId(DATA) {
  if (!DATA.workspaceId) { DATA.workspaceId = _newId(); return true; }
  return false;
}

// ── register ─────────────────────────────────────────────────────────────────

function register(test, assert, assertEqual) {

  console.log('\nStable IDs Migration:');

  // ── _newId ──────────────────────────────────────────────────────────────────

  test('_newId: returns a non-empty string', function () {
    var id = _newId();
    assert(typeof id === 'string' && id.length > 0, 'id must be non-empty string');
  });

  test('_newId: two consecutive calls produce different values', function () {
    var a = _newId(), b = _newId();
    assert(a !== b, 'ids must be unique: got ' + a + ' twice');
  });

  // ── _ensureWorkspaceId ──────────────────────────────────────────────────────

  test('workspaceId: generated when absent', function () {
    var DATA = { workspaceId: '' };
    var changed = _ensureWorkspaceId(DATA);
    assert(changed, 'should return true when generated');
    assert(DATA.workspaceId.length > 0, 'workspaceId must be non-empty after generation');
  });

  test('workspaceId: preserved when already present', function () {
    var DATA = { workspaceId: 'existing-id-abc' };
    var changed = _ensureWorkspaceId(DATA);
    assert(!changed, 'should return false when id already present');
    assertEqual(DATA.workspaceId, 'existing-id-abc', 'workspaceId must not be overwritten');
  });

  test('workspaceId: generated when field is undefined', function () {
    var DATA = {};
    _ensureWorkspaceId(DATA);
    assert(DATA.workspaceId && DATA.workspaceId.length > 0, 'workspaceId must be created from undefined');
  });

  test('workspaceId: running _ensureWorkspaceId twice does not change value', function () {
    var DATA = { workspaceId: '' };
    _ensureWorkspaceId(DATA);
    var first = DATA.workspaceId;
    _ensureWorkspaceId(DATA);
    assertEqual(DATA.workspaceId, first, 'second call must not change existing value');
  });

  // ── _stampExpenseIds ────────────────────────────────────────────────────────

  test('expenses without id get id stamped', function () {
    var expenses = { B1: { 'Nisan 2026': [{ tur: 'EL', no: '', tutar: 500, tarih: '', notlar: '' }] } };
    var count = _stampExpenseIds(expenses);
    assertEqual(count, 1, 'should stamp 1 item');
    assert(expenses.B1['Nisan 2026'][0].id.length > 0, 'item must now have id');
  });

  test('expenses with id keep their id', function () {
    var original = 'keep-me-123';
    var expenses = { B1: { 'Nisan 2026': [{ id: original, tur: 'EL', no: '', tutar: 500, tarih: '', notlar: '' }] } };
    var count = _stampExpenseIds(expenses);
    assertEqual(count, 0, 'should stamp 0 items');
    assertEqual(expenses.B1['Nisan 2026'][0].id, original, 'existing id must not change');
  });

  test('mixed items: only missing ids are stamped', function () {
    var expenses = {
      B1: {
        'Nisan 2026': [
          { id: 'keep-a', tur: 'EL', no: '', tutar: 100, tarih: '', notlar: '' },
          { tur: 'SU', no: '', tutar: 200, tarih: '', notlar: '' },
          { id: 'keep-b', tur: 'GAZ', no: '', tutar: 300, tarih: '', notlar: '' },
        ]
      }
    };
    var count = _stampExpenseIds(expenses);
    assertEqual(count, 1, 'should stamp only the 1 missing item');
    assertEqual(expenses.B1['Nisan 2026'][0].id, 'keep-a', 'keep-a unchanged');
    assert(expenses.B1['Nisan 2026'][1].id.length > 0, 'middle item gets id');
    assertEqual(expenses.B1['Nisan 2026'][2].id, 'keep-b', 'keep-b unchanged');
  });

  test('running migration twice does not change existing ids (idempotent)', function () {
    var expenses = {
      B1: { 'Nisan 2026': [{ tur: 'EL', no: '', tutar: 500, tarih: '', notlar: '' }] }
    };
    _stampExpenseIds(expenses);
    var firstId = expenses.B1['Nisan 2026'][0].id;
    var count2 = _stampExpenseIds(expenses);
    assertEqual(count2, 0, 'second run should stamp 0 items');
    assertEqual(expenses.B1['Nisan 2026'][0].id, firstId, 'id must not change on second run');
  });

  test('empty expenses object: no crash, 0 stamped', function () {
    var count = _stampExpenseIds({});
    assertEqual(count, 0, 'empty object → 0 stamped');
  });

  test('null/undefined expenses: no crash, 0 stamped', function () {
    assertEqual(_stampExpenseIds(null), 0);
    assertEqual(_stampExpenseIds(undefined), 0);
  });

  test('multiple buildings and months: all missing ids get stamped', function () {
    var expenses = {
      B1: {
        'Nisan 2026': [{ tur: 'A', no: '', tutar: 1, tarih: '', notlar: '' }],
        'Mayıs 2026': [{ tur: 'B', no: '', tutar: 2, tarih: '', notlar: '' }]
      },
      B2: {
        'Nisan 2026': [{ tur: 'C', no: '', tutar: 3, tarih: '', notlar: '' }]
      }
    };
    var count = _stampExpenseIds(expenses);
    assertEqual(count, 3, 'should stamp all 3 missing items');
    assert(expenses.B1['Nisan 2026'][0].id.length > 0, 'B1/Nisan');
    assert(expenses.B1['Mayıs 2026'][0].id.length > 0, 'B1/Mayıs');
    assert(expenses.B2['Nisan 2026'][0].id.length > 0, 'B2/Nisan');
  });

  test('stamped ids are all unique across buildings and months', function () {
    var expenses = {
      B1: { 'Nisan 2026': [{ tur: 'A', no: '', tutar: 1, tarih: '', notlar: '' }, { tur: 'B', no: '', tutar: 2, tarih: '', notlar: '' }] },
      B2: { 'Nisan 2026': [{ tur: 'C', no: '', tutar: 3, tarih: '', notlar: '' }] }
    };
    _stampExpenseIds(expenses);
    var ids = [
      expenses.B1['Nisan 2026'][0].id,
      expenses.B1['Nisan 2026'][1].id,
      expenses.B2['Nisan 2026'][0].id,
    ];
    var unique = new Set(ids);
    assertEqual(unique.size, 3, 'all stamped ids must be unique');
  });

  test('non-array month slot: no crash', function () {
    var expenses = { B1: { 'Nisan 2026': null } };
    var count = _stampExpenseIds(expenses);
    assertEqual(count, 0, 'null slot → 0 stamped, no crash');
  });

  // ── new expense entry has id (simulates creation sites) ────────────────────

  test('new expense entry includes id field', function () {
    var entry = { id: _newId(), tur: 'EL', no: '', tutar: 500, tarih: '2026-04-01', notlar: '' };
    assert(entry.id && entry.id.length > 0, 'new entry must have id');
    assertEqual(entry.tur, 'EL', 'tur preserved');
    assertEqual(entry.tutar, 500, 'tutar preserved');
  });

  test('edit preserves original id', function () {
    var original = { id: 'orig-id-xyz', tur: 'EL', no: '', tutar: 500, tarih: '2026-04-01', notlar: '' };
    var expenses = { B1: { 'Nisan 2026': [original] } };
    // Simulate edit-in-place: read existing id, build new entry
    var eidx = 0;
    var existingId = expenses.B1['Nisan 2026'][eidx].id;
    var entry = { id: existingId || _newId(), tur: 'EL', no: '', tutar: 999, tarih: '2026-04-01', notlar: 'edit' };
    expenses.B1['Nisan 2026'].splice(eidx, 1, entry);
    assertEqual(expenses.B1['Nisan 2026'][0].id, 'orig-id-xyz', 'id must be preserved after edit');
    assertEqual(expenses.B1['Nisan 2026'][0].tutar, 999, 'tutar updated');
  });

  test('move to different building/month preserves id', function () {
    var original = { id: 'move-id-abc', tur: 'SU', no: '', tutar: 300, tarih: '', notlar: '' };
    var expenses = {
      B1: { 'Nisan 2026': [original] },
      B2: { 'Mayıs 2026': [] }
    };
    // Simulate window.saveExp_ move: splice from original + push to new
    var eidx = 0;
    var existingId = expenses.B1['Nisan 2026'][eidx].id;
    var entry = { id: existingId || _newId(), tur: 'SU', no: '', tutar: 300, tarih: '', notlar: '' };
    expenses.B1['Nisan 2026'].splice(eidx, 1);
    expenses.B2['Mayıs 2026'].push(entry);
    assertEqual(expenses.B1['Nisan 2026'].length, 0, 'original slot empty after move');
    assertEqual(expenses.B2['Mayıs 2026'][0].id, 'move-id-abc', 'id preserved after move');
  });

  // ── import/restore round-trips ──────────────────────────────────────────────

  test('overwrite import with legacy data (no ids): all items get stamped', function () {
    var incoming = {
      B1: { 'Nisan 2026': [{ tur: 'A', no: '', tutar: 100, tarih: '', notlar: '' }] }
    };
    // Simulate _importCommit overwrite path
    var DATA = { expenses: incoming };
    _stampExpenseIds(DATA.expenses);
    assert(DATA.expenses.B1['Nisan 2026'][0].id.length > 0, 'legacy item gets id after overwrite import');
  });

  test('overwrite import with post-migration data (ids present): ids preserved', function () {
    var incoming = {
      B1: { 'Nisan 2026': [{ id: 'persisted-id', tur: 'A', no: '', tutar: 100, tarih: '', notlar: '' }] }
    };
    var DATA = { expenses: incoming };
    _stampExpenseIds(DATA.expenses);
    assertEqual(DATA.expenses.B1['Nisan 2026'][0].id, 'persisted-id', 'existing id must not be replaced');
  });

  test('merge import: incoming without id gets one before push', function () {
    var e = { tur: 'EL', no: '', tutar: 200, tarih: '2026-04-01', notlar: '' };
    // Simulate merge path: ensure id before push
    if (!e.id) e.id = _newId();
    assert(e.id.length > 0, 'item gets id assigned before push');
  });

  test('merge import: incoming with id keeps its id', function () {
    var e = { id: 'incoming-id', tur: 'EL', no: '', tutar: 200, tarih: '2026-04-01', notlar: '' };
    if (!e.id) e.id = _newId();
    assertEqual(e.id, 'incoming-id', 'incoming id preserved in merge');
  });

  test('workspaceId and expense ids survive JSON serialization round-trip', function () {
    var DATA = { workspaceId: '', expenses: { B1: { 'Nisan 2026': [{ tur: 'X', no: '', tutar: 1, tarih: '', notlar: '' }] } } };
    _ensureWorkspaceId(DATA);
    _stampExpenseIds(DATA.expenses);
    var wid = DATA.workspaceId;
    var eid = DATA.expenses.B1['Nisan 2026'][0].id;
    // Round-trip through JSON (simulates saveLocal → loadLocal)
    var loaded = JSON.parse(JSON.stringify(DATA));
    assertEqual(loaded.workspaceId, wid, 'workspaceId survives serialization');
    assertEqual(loaded.expenses.B1['Nisan 2026'][0].id, eid, 'expense id survives serialization');
  });

  test('_stampExpenseIds does not change tur/no/tutar/tarih/notlar', function () {
    var expenses = { B1: { 'Nisan 2026': [{ tur: 'GAZ', no: 'N1', tutar: 750, tarih: '2026-04-10', notlar: 'test' }] } };
    _stampExpenseIds(expenses);
    var item = expenses.B1['Nisan 2026'][0];
    assertEqual(item.tur, 'GAZ', 'tur unchanged');
    assertEqual(item.no, 'N1', 'no unchanged');
    assertEqual(item.tutar, 750, 'tutar unchanged');
    assertEqual(item.tarih, '2026-04-10', 'tarih unchanged');
    assertEqual(item.notlar, 'test', 'notlar unchanged');
  });

  test('_stampExpenseIds does not change array order', function () {
    var expenses = {
      B1: {
        'Nisan 2026': [
          { tur: 'A', no: '', tutar: 1, tarih: '', notlar: '' },
          { tur: 'B', no: '', tutar: 2, tarih: '', notlar: '' },
          { tur: 'C', no: '', tutar: 3, tarih: '', notlar: '' },
        ]
      }
    };
    _stampExpenseIds(expenses);
    var arr = expenses.B1['Nisan 2026'];
    assertEqual(arr.length, 3, 'array length unchanged');
    assertEqual(arr[0].tur, 'A', 'order[0]');
    assertEqual(arr[1].tur, 'B', 'order[1]');
    assertEqual(arr[2].tur, 'C', 'order[2]');
  });

}

// ── Standalone runner ─────────────────────────────────────────────────────────

if (require.main === module) {
  var _passed = 0, _failed = 0;
  function test(name, fn) {
    try   { fn(); console.log('  ✅ ' + name); _passed++; }
    catch (e) { console.error('  ❌ ' + name + ': ' + e.message); _failed++; }
  }
  function assert(condition, msg) {
    if (!condition) throw new Error(msg || 'Assertion failed');
  }
  function assertEqual(a, b, msg) {
    if (a !== b) throw new Error((msg || 'assertEqual') + ': expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a));
  }
  console.log('\n═══ Stable IDs Migration Tests (standalone) ═══');
  register(test, assert, assertEqual);
  console.log('\n═══ Results: ' + _passed + ' passed, ' + _failed + ' failed ═══\n');
  if (_failed > 0) { process.exit(1); } else { process.exit(0); }
}

module.exports = { register };
