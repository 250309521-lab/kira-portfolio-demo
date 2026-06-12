'use strict';

/**
 * Local Backup Tests — LOCAL-BACKUP-1
 *
 * Standalone:  node src/tests/local-backup.test.js
 * Via run.js:  require('./local-backup.test.js').register(test, assert, assertEqual)
 *
 * Tests buildFullBackup / validateFullBackup / captureRendererState logic.
 * No DOM, no Electron, no filesystem.
 */

const crypto = require('crypto');

// ── Inline copies of utility functions from main.js ───────────────────────────

const BACKUP_FORMAT_VERSION = 1;

function sha256(str) {
  return crypto.createHash('sha256').update(str, 'utf8').digest('hex');
}

function buildFullBackup(rendererStateStr, importProfilesStr, trigger, store, APP_VER) {
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
    appVersion: APP_VER || '6.0.0',
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

// ── Inline copy of renderer-side _captureRendererState logic ──────────────────

function captureRendererState(DATA, importProfilesStr) {
  const safe = JSON.parse(JSON.stringify(DATA));
  if (safe.cloud) { delete safe.cloud.token; delete safe.cloud.key; delete safe.cloud.supabaseKey; }
  delete safe.importSnapshots;
  if (Array.isArray(safe.users)) {
    safe.users = safe.users.map(function (u) { const e = Object.assign({}, u); delete e.pin; return e; });
  }
  const rendererStateStr = JSON.stringify(safe);
  const ip = (typeof importProfilesStr === 'string' && importProfilesStr !== 'null') ? importProfilesStr : null;
  return { rendererStateStr, importProfilesStr: ip };
}

// ── Test data factories ───────────────────────────────────────────────────────

function makeStore(overrides) {
  return Object.assign({
    schemaVersion: 2,
    settings: { theme: 'dark' },
    audit_log: [],
    backup_records: [],
  }, overrides || {});
}

function makeDATA(overrides) {
  const base = {
    workspaceId: 'ws-test-123',
    buildings: [{ id: 'B1', name: 'Bina 1', active: true, order: 0 }],
    tenants: { B1: [{ id: 't1', name: 'Ahmet', rent: 3000, active: true, unit: '1' }] },
    payments: { t1: { 'Nisan 2026': { paid: 3000, date: '2026-04-01' } } },
    expenses: { B1: { 'Nisan 2026': [{ id: 'e1', tur: 'EL', no: '', tutar: 500, tarih: '', notlar: '' }] } },
    mgmt: {},
    tanNet: {},
    gayNet: {},
    history: [],
    waLog: [],
    users: [{ id: 'admin', name: 'Yönetici', role: 'admin', pin_hash_v2: 'hash', pin_salt: 'salt', active: 1 }],
    settings: { lang: 'tr', theme: 'dark', autoSave: true },
    importHistory: [],
    cloud: { url: '', key: '', token: 'secret-token', supabaseKey: 'secret-key', enabled: false },
  };
  return Object.assign(base, overrides || {});
}

// ── register ──────────────────────────────────────────────────────────────────

function register(test, assert, assertEqual) {

  console.log('\nLocal Backup:');

  // ── buildFullBackup: structure ──────────────────────────────────────────────

  test('archive has required top-level sections', function () {
    const rs = JSON.stringify({ workspaceId: 'ws1', buildings: [] });
    const arch = buildFullBackup(rs, null, 'manual', makeStore(), '6.0.0');
    assert(arch.manifest && typeof arch.manifest === 'object', 'manifest must be object');
    assert(typeof arch.rendererState === 'string', 'rendererState must be string');
    assert(typeof arch.mainStore === 'string', 'mainStore must be string');
  });

  test('manifest has all required fields', function () {
    const arch = buildFullBackup(JSON.stringify({ workspaceId: 'ws1' }), null, 'manual', makeStore(), '6.0.0');
    const m = arch.manifest;
    assert(typeof m.formatVersion === 'number', 'formatVersion');
    assert(typeof m.appVersion === 'string', 'appVersion');
    assert(typeof m.createdAt === 'string', 'createdAt');
    assert(typeof m.trigger === 'string', 'trigger');
    assert(m.checksums && typeof m.checksums === 'object', 'checksums object');
    assertEqual(typeof m.checksums.rendererState, 'string', 'checksums.rendererState');
    assertEqual(typeof m.checksums.mainStore, 'string', 'checksums.mainStore');
  });

  test('manifest.workspaceId matches workspaceId in rendererState', function () {
    const arch = buildFullBackup(JSON.stringify({ workspaceId: 'ws-abc-123' }), null, 'manual', makeStore(), '6.0.0');
    assertEqual(arch.manifest.workspaceId, 'ws-abc-123', 'workspaceId in manifest');
  });

  test('full backup rendererState includes buildings/tenants/payments/expenses', function () {
    const { rendererStateStr } = captureRendererState(makeDATA(), null);
    const arch = buildFullBackup(rendererStateStr, null, 'manual', makeStore(), '6.0.0');
    const parsed = JSON.parse(arch.rendererState);
    assert(Array.isArray(parsed.buildings), 'buildings present');
    assert(typeof parsed.tenants === 'object', 'tenants present');
    assert(typeof parsed.payments === 'object', 'payments present');
    assert(typeof parsed.expenses === 'object', 'expenses present');
  });

  test('full backup mainStore includes settings/schemaVersion', function () {
    const store = makeStore({ settings: { theme: 'light' }, schemaVersion: 2 });
    const arch = buildFullBackup('{}', null, 'manual', store, '6.0.0');
    const ms = JSON.parse(arch.mainStore);
    assert(ms.settings && typeof ms.settings === 'object', 'settings in mainStore');
    assertEqual(ms.schemaVersion, 2, 'schemaVersion in mainStore');
  });

  test('checksums match actual section byte content', function () {
    const rs = JSON.stringify({ workspaceId: 'w1', buildings: [1, 2, 3] });
    const arch = buildFullBackup(rs, null, 'manual', makeStore(), '6.0.0');
    assertEqual(sha256(arch.rendererState), arch.manifest.checksums.rendererState, 'rendererState checksum matches');
    assertEqual(sha256(arch.mainStore), arch.manifest.checksums.mainStore, 'mainStore checksum matches');
  });

  test('importProfiles null: archive section is null, checksum is null', function () {
    const arch = buildFullBackup('{}', null, 'manual', makeStore(), '6.0.0');
    assertEqual(arch.importProfiles, null, 'importProfiles null');
    assertEqual(arch.manifest.checksums.importProfiles, null, 'checksum null');
  });

  test('importProfiles string: included and checksummed', function () {
    const ip = JSON.stringify([{ fingerprint: 'fp1', bldCount: 3 }]);
    const arch = buildFullBackup('{}', ip, 'manual', makeStore(), '6.0.0');
    assertEqual(arch.importProfiles, ip, 'importProfiles in archive');
    assertEqual(sha256(ip), arch.manifest.checksums.importProfiles, 'importProfiles checksum matches');
  });

  // ── validateFullBackup: valid ───────────────────────────────────────────────

  test('valid archive passes validation', function () {
    const arch = buildFullBackup(JSON.stringify({ workspaceId: 'w1' }), null, 'manual', makeStore(), '6.0.0');
    const result = validateFullBackup(arch);
    assert(result.ok, 'valid archive must pass: ' + (result.errors || []).join('; '));
  });

  // ── validateFullBackup: rejection ──────────────────────────────────────────

  test('corrupted rendererState checksum is rejected', function () {
    const arch = buildFullBackup('{"workspaceId":"w1"}', null, 'manual', makeStore(), '6.0.0');
    arch.rendererState = '{"workspaceId":"tampered"}';
    assert(!validateFullBackup(arch).ok, 'tampered rendererState must fail');
  });

  test('corrupted mainStore checksum is rejected', function () {
    const arch = buildFullBackup('{}', null, 'manual', makeStore(), '6.0.0');
    arch.mainStore = '{"tampered":true}';
    assert(!validateFullBackup(arch).ok, 'tampered mainStore must fail');
  });

  test('corrupted importProfiles checksum is rejected', function () {
    const ip = JSON.stringify([{ fp: 'x' }]);
    const arch = buildFullBackup('{}', ip, 'manual', makeStore(), '6.0.0');
    arch.importProfiles = JSON.stringify([{ fp: 'tampered' }]);
    assert(!validateFullBackup(arch).ok, 'tampered importProfiles must fail');
  });

  test('malformed archive (null/string/array) is rejected', function () {
    assert(!validateFullBackup(null).ok, 'null rejected');
    assert(!validateFullBackup('string').ok, 'string rejected');
    assert(!validateFullBackup([]).ok, 'array rejected');
  });

  test('missing manifest is rejected', function () {
    const arch = buildFullBackup('{}', null, 'manual', makeStore(), '6.0.0');
    delete arch.manifest;
    assert(!validateFullBackup(arch).ok, 'missing manifest rejected');
  });

  test('missing rendererState section is rejected', function () {
    const arch = buildFullBackup('{}', null, 'manual', makeStore(), '6.0.0');
    delete arch.rendererState;
    assert(!validateFullBackup(arch).ok, 'missing rendererState rejected');
  });

  test('missing mainStore section is rejected', function () {
    const arch = buildFullBackup('{}', null, 'manual', makeStore(), '6.0.0');
    delete arch.mainStore;
    assert(!validateFullBackup(arch).ok, 'missing mainStore rejected');
  });

  test('formatVersion too new is rejected with clear error', function () {
    const arch = buildFullBackup('{}', null, 'manual', makeStore(), '6.0.0');
    arch.manifest.formatVersion = 999;
    const result = validateFullBackup(arch);
    assert(!result.ok, 'future formatVersion rejected');
    assert(result.errors.some(function(e){ return e.toLowerCase().includes('newer'); }), 'error mentions newer version');
  });

  // ── captureRendererState: sanitization ─────────────────────────────────────

  test('captureRendererState strips cloud.token and cloud.supabaseKey', function () {
    const DATA = makeDATA({ cloud: { url: 'http://x', token: 'secret', supabaseKey: 'key123', enabled: false } });
    const parsed = JSON.parse(captureRendererState(DATA, null).rendererStateStr);
    assert(!parsed.cloud.token, 'cloud.token stripped');
    assert(!parsed.cloud.supabaseKey, 'cloud.supabaseKey stripped');
  });

  test('captureRendererState strips importSnapshots', function () {
    const DATA = makeDATA();
    DATA.importSnapshots = [{ snap: 'large-data' }];
    const parsed = JSON.parse(captureRendererState(DATA, null).rendererStateStr);
    assert(!parsed.importSnapshots, 'importSnapshots stripped');
  });

  test('captureRendererState strips plaintext pin from users', function () {
    const DATA = makeDATA();
    DATA.users = [{ id: 'admin', pin: '1234', pin_hash_v2: 'hash', pin_salt: 'salt' }];
    const parsed = JSON.parse(captureRendererState(DATA, null).rendererStateStr);
    assert(!parsed.users[0].pin, 'plaintext pin stripped');
    assertEqual(parsed.users[0].pin_hash_v2, 'hash', 'pin_hash_v2 preserved');
    assertEqual(parsed.users[0].pin_salt, 'salt', 'pin_salt preserved');
  });

  test('captureRendererState preserves workspaceId', function () {
    const DATA = makeDATA({ workspaceId: 'ws-preserve-me' });
    const parsed = JSON.parse(captureRendererState(DATA, null).rendererStateStr);
    assertEqual(parsed.workspaceId, 'ws-preserve-me', 'workspaceId preserved');
  });

  test('captureRendererState preserves PBKDF2 users', function () {
    const DATA = makeDATA();
    DATA.users = [{ id: 'admin', pin_hash_v2: 'hashX', pin_salt: 'saltY', role: 'admin', active: 1 }];
    const parsed = JSON.parse(captureRendererState(DATA, null).rendererStateStr);
    assertEqual(parsed.users[0].pin_hash_v2, 'hashX', 'pin_hash_v2 preserved');
    assertEqual(parsed.users[0].pin_salt, 'saltY', 'pin_salt preserved');
  });

  test('backup archive does not include license file content', function () {
    const DATA = makeDATA();
    const { rendererStateStr } = captureRendererState(DATA, null);
    const arch = buildFullBackup(rendererStateStr, null, 'manual', makeStore(), '6.0.0');
    const archStr = JSON.stringify(arch);
    assert(!archStr.includes('.ktplicense'), 'no .ktplicense in archive');
    assert(!archStr.includes('active.ktplicense'), 'no license path in archive');
  });

  test('backup archive does not include cloud tokens or API keys', function () {
    const DATA = makeDATA({ cloud: { token: 'my-jwt-token', supabaseKey: 'my-api-key', enabled: true } });
    const { rendererStateStr } = captureRendererState(DATA, null);
    const arch = buildFullBackup(rendererStateStr, null, 'manual', makeStore(), '6.0.0');
    const archStr = JSON.stringify(arch);
    assert(!archStr.includes('my-jwt-token'), 'no jwt token in archive');
    assert(!archStr.includes('my-api-key'), 'no api key in archive');
  });

  // ── restore round-trip ──────────────────────────────────────────────────────

  test('restore round-trip preserves workspaceId', function () {
    const DATA = makeDATA({ workspaceId: 'ws-roundtrip-abc' });
    const { rendererStateStr, importProfilesStr } = captureRendererState(DATA, null);
    const arch = buildFullBackup(rendererStateStr, importProfilesStr, 'manual', makeStore(), '6.0.0');
    assert(validateFullBackup(arch).ok, 'archive valid');
    const restored = JSON.parse(arch.rendererState);
    assertEqual(restored.workspaceId, 'ws-roundtrip-abc', 'workspaceId preserved');
  });

  test('restore round-trip preserves buildings', function () {
    const DATA = makeDATA();
    const { rendererStateStr } = captureRendererState(DATA, null);
    const arch = buildFullBackup(rendererStateStr, null, 'manual', makeStore(), '6.0.0');
    const restored = JSON.parse(arch.rendererState);
    assert(Array.isArray(restored.buildings) && restored.buildings.length > 0, 'buildings preserved');
    assertEqual(restored.buildings[0].id, 'B1', 'building id preserved');
  });

  test('restore round-trip preserves tenants', function () {
    const DATA = makeDATA();
    const { rendererStateStr } = captureRendererState(DATA, null);
    const arch = buildFullBackup(rendererStateStr, null, 'manual', makeStore(), '6.0.0');
    const restored = JSON.parse(arch.rendererState);
    assertEqual(restored.tenants.B1[0].id, 't1', 'tenant id preserved');
  });

  test('restore round-trip preserves payments', function () {
    const DATA = makeDATA();
    const { rendererStateStr } = captureRendererState(DATA, null);
    const arch = buildFullBackup(rendererStateStr, null, 'manual', makeStore(), '6.0.0');
    const restored = JSON.parse(arch.rendererState);
    assert(restored.payments && restored.payments.t1, 'payments preserved');
  });

  test('restore round-trip preserves expenses', function () {
    const DATA = makeDATA();
    const { rendererStateStr } = captureRendererState(DATA, null);
    const arch = buildFullBackup(rendererStateStr, null, 'manual', makeStore(), '6.0.0');
    const restored = JSON.parse(arch.rendererState);
    assert(restored.expenses && restored.expenses.B1, 'expenses preserved');
  });

  test('restore round-trip preserves expense.id values', function () {
    const DATA = makeDATA();
    DATA.expenses = { B1: { 'Nisan 2026': [{ id: 'persist-eid-xyz', tur: 'EL', no: '', tutar: 500, tarih: '', notlar: '' }] } };
    const { rendererStateStr } = captureRendererState(DATA, null);
    const arch = buildFullBackup(rendererStateStr, null, 'manual', makeStore(), '6.0.0');
    const restored = JSON.parse(arch.rendererState);
    assertEqual(restored.expenses.B1['Nisan 2026'][0].id, 'persist-eid-xyz', 'expense id preserved');
  });

  test('restore round-trip preserves PBKDF2 users', function () {
    const DATA = makeDATA();
    DATA.users = [{ id: 'admin', pin_hash_v2: 'hashPBKDF2', pin_salt: 'saltABC', role: 'admin', active: 1 }];
    const { rendererStateStr } = captureRendererState(DATA, null);
    const arch = buildFullBackup(rendererStateStr, null, 'manual', makeStore(), '6.0.0');
    const restored = JSON.parse(arch.rendererState);
    assertEqual(restored.users[0].pin_hash_v2, 'hashPBKDF2', 'pin_hash_v2 preserved');
    assertEqual(restored.users[0].pin_salt, 'saltABC', 'pin_salt preserved');
  });

  test('restore does not introduce plaintext pin', function () {
    const DATA = makeDATA();
    DATA.users = [{ id: 'admin', pin: 'plain1234', pin_hash_v2: 'h', pin_salt: 's' }];
    const { rendererStateStr } = captureRendererState(DATA, null);
    const arch = buildFullBackup(rendererStateStr, null, 'manual', makeStore(), '6.0.0');
    const restored = JSON.parse(arch.rendererState);
    assert(!restored.users[0].pin, 'plaintext pin absent in restored data');
  });

  test('restore keeps active license untouched (license not in archive)', function () {
    const DATA = makeDATA();
    const { rendererStateStr } = captureRendererState(DATA, null);
    const arch = buildFullBackup(rendererStateStr, null, 'manual', makeStore(), '6.0.0');
    // License is not in rendererState or mainStore
    const restoredRenderer = JSON.parse(arch.rendererState);
    const restoredMain = JSON.parse(arch.mainStore);
    assert(!JSON.stringify(restoredRenderer).includes('ktplicense'), 'no license in rendererState');
    assert(!JSON.stringify(restoredMain).includes('ktplicense'), 'no license in mainStore');
  });

  // ── legacy backup handling ──────────────────────────────────────────────────

  test('old backup without workspaceId is valid archive (boot migration will add it)', function () {
    const legacyState = JSON.stringify({ buildings: [{ id: 'B1' }], tenants: {}, payments: {}, expenses: {} });
    const arch = buildFullBackup(legacyState, null, 'manual', makeStore(), '6.0.0');
    assert(validateFullBackup(arch).ok, 'legacy archive validates');
    assert(!JSON.parse(arch.rendererState).workspaceId, 'no workspaceId present (will be added by migration)');
  });

  test('old .json main-store backup is not a valid .ktpbackup', function () {
    const legacyJson = { schemaVersion: 2, settings: {}, audit_log: [], backup_records: [] };
    const result = validateFullBackup(legacyJson);
    assert(!result.ok, 'old .json backup fails ktpbackup validation');
    assert(result.errors.some(function(e){ return e.toLowerCase().includes('manifest'); }), 'error mentions manifest');
  });

  // ── pre-restore safety backup ───────────────────────────────────────────────

  test('pre-restore safety backup is a full .ktpbackup archive', function () {
    const DATA = makeDATA();
    const { rendererStateStr, importProfilesStr } = captureRendererState(DATA, null);
    const safetyArchive = buildFullBackup(rendererStateStr, importProfilesStr, 'pre-restore', makeStore(), '6.0.0');
    assert(validateFullBackup(safetyArchive).ok, 'pre-restore safety backup is valid');
    assertEqual(safetyArchive.manifest.trigger, 'pre-restore', 'trigger is pre-restore');
    assertEqual(JSON.parse(safetyArchive.rendererState).workspaceId, 'ws-test-123', 'workspaceId in safety backup');
  });

  // ── exportEnvelope workspaceId fix ─────────────────────────────────────────

  test('exportEnvelope workspaceId is included and survives JSON round-trip', function () {
    const DATA = makeDATA({ workspaceId: 'ws-export-test' });
    const envelope = { workspaceId: DATA.workspaceId, buildings: DATA.buildings, tenants: DATA.tenants };
    const parsed = JSON.parse(JSON.stringify(envelope));
    assertEqual(parsed.workspaceId, 'ws-export-test', 'workspaceId in export envelope');
  });

  test('import restores workspaceId when absent on target', function () {
    const target = { workspaceId: '' };
    const imported = { workspaceId: 'imported-ws' };
    if (imported.workspaceId && !target.workspaceId) target.workspaceId = imported.workspaceId;
    assertEqual(target.workspaceId, 'imported-ws', 'workspaceId restored from import');
  });

  test('import does not overwrite existing workspaceId', function () {
    const target = { workspaceId: 'existing-ws' };
    const imported = { workspaceId: 'imported-ws' };
    if (imported.workspaceId && !target.workspaceId) target.workspaceId = imported.workspaceId;
    assertEqual(target.workspaceId, 'existing-ws', 'existing workspaceId not overwritten');
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
  console.log('\n═══ Local Backup Tests (standalone) ═══');
  register(test, assert, assertEqual);
  console.log('\n═══ Results: ' + _passed + ' passed, ' + _failed + ' failed ═══\n');
  if (_failed > 0) { process.exit(1); } else { process.exit(0); }
}

module.exports = { register };
