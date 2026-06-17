'use strict';

const ipc_module = require('../cloud/cloud-backup-ipc');

if (!process.env.SUPABASE_URL)             process.env.SUPABASE_URL             = 'http://localhost:54321';
if (!process.env.SUPABASE_PUBLISHABLE_KEY) process.env.SUPABASE_PUBLISHABLE_KEY = 'test-anon-key';

var GOOD_CHECKSUM = 'a'.repeat(64);
var WS_ID = '11111111-1111-1111-1111-111111111111';

// ── Mock helpers ──────────────────────────────────────────────────────────────

function makeMockIpcMain() {
  var _handlers = {};
  return {
    handle: function(channel, fn) { _handlers[channel] = fn; },
    _invoke: function(channel, event, payload) {
      var h = _handlers[channel];
      if (!h) throw new Error('No handler registered for channel: ' + channel);
      return h(event, payload);
    },
    _hasChannel: function(channel) { return Object.prototype.hasOwnProperty.call(_handlers, channel); },
  };
}

// Mock backup module. Tracks calls; can be told to inject "leaky" fields to
// prove the IPC layer scrubs them.
function makeMockBackup(overrides) {
  var _calls = {};
  function _track(name, args) { (_calls[name] = _calls[name] || []).push(args); }
  var base = {
    getCloudBackupReadiness: function(workspaceId) {
      _track('getCloudBackupReadiness', [workspaceId]);
      return Promise.resolve({ ok: true, role: 'owner', canBackup: true, maxBytes: 104857600 });
    },
    derivePreflightMetadata: function(input) {
      _track('derivePreflightMetadata', [input]);
      return {
        ok: true, withinLimit: true, byteSize: input.byteSize, checksumValid: true,
        metadataValid: true, trigger: 'manual', formatVersion: 1, maxBytes: 104857600,
        storagePath: 'workspaces/' + input.workspaceId + '/x_pending.ktpbackup',
        metadata: { p_workspace_id: input.workspaceId, p_checksum: input.checksum },
      };
    },
  };
  var b = Object.assign({}, base, overrides || {});
  b._calls = _calls;
  return b;
}

function makeGuard(ok) {
  return function() { return Promise.resolve(ok ? { ok: true } : { ok: false, reason: 'license_required' }); };
}

function makeLog() {
  var _lines = [];
  var fn = function(msg) { _lines.push(String(msg)); };
  fn._lines = _lines;
  return fn;
}

function makeDeps(cloudBackup, extra) {
  return Object.assign({
    cloudBackup: cloudBackup,
    buildPreflightArchive: function(rs, ip) {
      return { byteSize: 4096, checksum: GOOD_CHECKSUM, appVersion: '6.0.0' };
    },
    buildManualBackupArchive: function(rs, ip) {
      return { archiveStr: '{"manifest":1}', byteSize: 4096, checksum: GOOD_CHECKSUM, appVersion: '6.0.0' };
    },
    getLastLocalBackupAt: function() { return '2026-06-15T10:00:00.000Z'; },
  }, extra || {});
}

// ── Sync tests ────────────────────────────────────────────────────────────────

function register(test, assert, assertEqual) {

  console.log('\nCloud Backup IPC — Channel Registration (CLOUD-FOUNDATION-1F.4A):');

  test('cloud-backup-ipc: register creates all three channels (CLOUD-FOUNDATION-1F.4B)', function() {
    var ipc = makeMockIpcMain();
    ipc_module.register(ipc, makeGuard(true), makeLog(), makeDeps(makeMockBackup()));
    assert(ipc._hasChannel('cloud:getCloudBackupReadiness'),   'readiness channel must exist');
    assert(ipc._hasChannel('cloud:buildCloudBackupPreflight'), 'preflight channel must exist');
    assert(ipc._hasChannel('cloud:createManualBackup'),        'manual backup channel must exist');
  });

  test('cloud-backup-ipc: _pickManualBackupResult whitelists safe fields only', function() {
    var out = ipc_module._pickManualBackupResult({
      ok: true, backupId: 'bkp-001', createdAt: '2026-06-16T00:00:00Z',
      byteSize: 4096, trigger: 'manual',
      storagePath: 'workspaces/x/y.ktpbackup', checksum: GOOD_CHECKSUM,
      access_token: 'leak', device_id: 'leak',
    });
    var keys = Object.keys(out).sort().join(',');
    assertEqual(keys, 'backupId,byteSize,createdAt,ok,trigger');
    assert(!('storagePath' in out), 'storagePath must not pass through');
    assert(!('checksum' in out),    'raw checksum must not pass through');
    assert(!('access_token' in out), 'token must not pass through');
  });

  test('cloud-backup-ipc: _validateWorkspaceIdPayload — valid', function() {
    assert(ipc_module._validateWorkspaceIdPayload({ workspaceId: WS_ID }));
  });
  test('cloud-backup-ipc: _validateWorkspaceIdPayload — missing rejected', function() {
    assert(!ipc_module._validateWorkspaceIdPayload({}));
  });
  test('cloud-backup-ipc: _validateWorkspaceIdPayload — empty rejected', function() {
    assert(!ipc_module._validateWorkspaceIdPayload({ workspaceId: '   ' }));
  });
  test('cloud-backup-ipc: _validateWorkspaceIdPayload — null rejected', function() {
    assert(!ipc_module._validateWorkspaceIdPayload(null));
  });

  test('cloud-backup-ipc: _sanitize strips secret keys', function() {
    var out = ipc_module._sanitize({
      ok: true, role: 'owner', deviceId: 'D', storagePath: 'p', checksum: 'c', metadata: {},
    });
    assert(out.ok === true && out.role === 'owner', 'safe fields kept');
    assert(!('deviceId' in out),    'deviceId stripped');
    assert(!('storagePath' in out), 'storagePath stripped');
    assert(!('checksum' in out),    'checksum stripped');
    assert(!('metadata' in out),    'metadata stripped');
  });

  test('cloud-backup-ipc: _pickPreflight whitelists only safe fields', function() {
    var out = ipc_module._pickPreflight({
      ok: true, withinLimit: true, byteSize: 4096, maxBytes: 104857600,
      checksumValid: true, metadataValid: true,
      storagePath: 'workspaces/x/y.ktpbackup', checksum: GOOD_CHECKSUM,
      metadata: { p_checksum: GOOD_CHECKSUM },
    }, '2026-06-15T10:00:00.000Z');
    var keys = Object.keys(out).sort().join(',');
    assertEqual(keys, 'byteSize,checksumValid,lastLocalBackupAt,maxBytes,metadataValid,ok,withinLimit');
    assert(!('storagePath' in out), 'storagePath must not pass through');
    assert(!('checksum' in out),    'checksum must not pass through');
    assert(!('metadata' in out),    'metadata must not pass through');
  });
}

// ── Async tests ───────────────────────────────────────────────────────────────

async function registerAsync(testAsync, assert, assertEqual) {

  await testAsync('cloud-backup-ipc: getCloudBackupReadiness — license gate blocks', async function() {
    var ipc = makeMockIpcMain();
    var backup = makeMockBackup();
    ipc_module.register(ipc, makeGuard(false), makeLog(), makeDeps(backup));
    var r = await ipc._invoke('cloud:getCloudBackupReadiness', {}, { workspaceId: WS_ID });
    assert(!r.ok); assertEqual(r.error, 'license_required');
    assert(!backup._calls.getCloudBackupReadiness, 'module must not be called when license fails');
  });

  await testAsync('cloud-backup-ipc: getCloudBackupReadiness — invalid payload rejected', async function() {
    var ipc = makeMockIpcMain();
    var backup = makeMockBackup();
    ipc_module.register(ipc, makeGuard(true), makeLog(), makeDeps(backup));
    var r = await ipc._invoke('cloud:getCloudBackupReadiness', {}, {});
    assert(!r.ok); assertEqual(r.error, 'invalid_input');
    assert(!backup._calls.getCloudBackupReadiness, 'module must not be called on invalid input');
  });

  await testAsync('cloud-backup-ipc: getCloudBackupReadiness — forwards workspaceId', async function() {
    var ipc = makeMockIpcMain();
    var backup = makeMockBackup();
    ipc_module.register(ipc, makeGuard(true), makeLog(), makeDeps(backup));
    var r = await ipc._invoke('cloud:getCloudBackupReadiness', {}, { workspaceId: WS_ID });
    assert(r.ok); assertEqual(r.role, 'owner');
    assertEqual(backup._calls.getCloudBackupReadiness[0][0], WS_ID);
  });

  await testAsync('cloud-backup-ipc: getCloudBackupReadiness — scrubs leaked secrets from module result', async function() {
    var ipc = makeMockIpcMain();
    var backup = makeMockBackup({
      getCloudBackupReadiness: function() {
        return Promise.resolve({
          ok: true, role: 'owner', canBackup: true,
          deviceId: 'leak', access_token: 'leak', service_role: 'leak', storagePath: 'leak',
        });
      },
    });
    ipc_module.register(ipc, makeGuard(true), makeLog(), makeDeps(backup));
    var r = await ipc._invoke('cloud:getCloudBackupReadiness', {}, { workspaceId: WS_ID });
    assert(r.ok);
    assert(!('deviceId' in r),      'deviceId scrubbed');
    assert(!('access_token' in r),  'access_token scrubbed');
    assert(!('service_role' in r),  'service_role scrubbed');
    assert(!('storagePath' in r),   'storagePath scrubbed');
  });

  await testAsync('cloud-backup-ipc: buildCloudBackupPreflight — builds in memory and returns safe fields only', async function() {
    var ipc = makeMockIpcMain();
    var backup = makeMockBackup();
    ipc_module.register(ipc, makeGuard(true), makeLog(), makeDeps(backup));
    var r = await ipc._invoke('cloud:buildCloudBackupPreflight', {}, { workspaceId: WS_ID, rendererState: '{"a":1}' });
    assert(r.ok, 'preflight ok');
    assertEqual(r.byteSize, 4096);
    assertEqual(r.withinLimit, true);
    assertEqual(r.lastLocalBackupAt, '2026-06-15T10:00:00.000Z');
    assert(!('storagePath' in r), 'storagePath must not reach renderer');
    assert(!('checksum' in r),    'raw checksum must not reach renderer');
    assert(!('metadata' in r),    'metadata shape must not reach renderer');
  });

  await testAsync('cloud-backup-ipc: buildCloudBackupPreflight — passes real byteSize/checksum into derive', async function() {
    var ipc = makeMockIpcMain();
    var backup = makeMockBackup();
    ipc_module.register(ipc, makeGuard(true), makeLog(), makeDeps(backup));
    await ipc._invoke('cloud:buildCloudBackupPreflight', {}, { workspaceId: WS_ID, rendererState: '{}' });
    var input = backup._calls.derivePreflightMetadata[0][0];
    assertEqual(input.workspaceId, WS_ID);
    assertEqual(input.byteSize, 4096);
    assertEqual(input.checksum, GOOD_CHECKSUM);
    assertEqual(input.trigger, 'manual');
  });

  await testAsync('cloud-backup-ipc: buildCloudBackupPreflight — license gate blocks before building', async function() {
    var ipc = makeMockIpcMain();
    var built = 0;
    var deps = makeDeps(makeMockBackup(), { buildPreflightArchive: function() { built++; return { byteSize: 1, checksum: GOOD_CHECKSUM }; } });
    ipc_module.register(ipc, makeGuard(false), makeLog(), deps);
    var r = await ipc._invoke('cloud:buildCloudBackupPreflight', {}, { workspaceId: WS_ID });
    assert(!r.ok); assertEqual(r.error, 'license_required');
    assertEqual(built, 0, 'archive must not be built when license fails');
  });

  await testAsync('cloud-backup-ipc: buildCloudBackupPreflight — local build failure → local_backup_unavailable', async function() {
    var ipc = makeMockIpcMain();
    var deps = makeDeps(makeMockBackup(), { buildPreflightArchive: function() { throw new Error('disk'); } });
    ipc_module.register(ipc, makeGuard(true), makeLog(), deps);
    var r = await ipc._invoke('cloud:buildCloudBackupPreflight', {}, { workspaceId: WS_ID });
    assert(!r.ok); assertEqual(r.error, 'local_backup_unavailable');
  });

  await testAsync('cloud-backup-ipc: buildCloudBackupPreflight — never invokes a write/upload method', async function() {
    var ipc = makeMockIpcMain();
    // Backup module with ONLY readiness + derive. If the handler tried to upload
    // or write metadata, it would have to reference a method that does not exist.
    var backup = makeMockBackup();
    var forbidden = ['uploadBackup', 'createCloudBackupMetadata', 'createBackupDownloadUrl', 'restoreBackup'];
    forbidden.forEach(function(name) {
      backup[name] = function() { throw new Error('forbidden write method called: ' + name); };
    });
    ipc_module.register(ipc, makeGuard(true), makeLog(), makeDeps(backup));
    var r = await ipc._invoke('cloud:buildCloudBackupPreflight', {}, { workspaceId: WS_ID });
    assert(r.ok, 'preflight succeeded without any write method');
    forbidden.forEach(function(name) {
      assert(!backup._calls[name], name + ' must never be called');
    });
  });

  await testAsync('cloud-backup-ipc: handler exception → unknown_error (no throw to renderer)', async function() {
    var ipc = makeMockIpcMain();
    var backup = makeMockBackup({ getCloudBackupReadiness: function() { throw new Error('boom'); } });
    ipc_module.register(ipc, makeGuard(true), makeLog(), makeDeps(backup));
    var r = await ipc._invoke('cloud:getCloudBackupReadiness', {}, { workspaceId: WS_ID });
    assert(!r.ok); assertEqual(r.error, 'unknown_error');
  });

  // ── cloud:createManualBackup (CLOUD-FOUNDATION-1F.4B) ─────────────────────────

  function makeManualMockBackup(overrides) {
    var base = makeMockBackup(overrides);
    base.createManualCloudBackup = function(input) {
      if (overrides && overrides.createManualCloudBackup) {
        return overrides.createManualCloudBackup(input);
      }
      return Promise.resolve({ ok: true, backupId: 'bkp-001', createdAt: '2026-06-16T00:00:00Z', byteSize: input.byteSize, trigger: 'manual' });
    };
    return base;
  }

  await testAsync('cloud-backup-ipc: createManualBackup — license gate blocks before building', async function() {
    var ipc = makeMockIpcMain();
    var built = 0;
    var deps = makeDeps(makeManualMockBackup(), {
      buildManualBackupArchive: function() { built++; return { archiveStr: '{}', byteSize: 1, checksum: GOOD_CHECKSUM }; },
    });
    ipc_module.register(ipc, makeGuard(false), makeLog(), deps);
    var r = await ipc._invoke('cloud:createManualBackup', {}, { workspaceId: WS_ID });
    assert(!r.ok); assertEqual(r.error, 'license_required');
    assertEqual(built, 0, 'archive must not be built when license fails');
  });

  await testAsync('cloud-backup-ipc: createManualBackup — invalid payload rejected', async function() {
    var ipc = makeMockIpcMain();
    ipc_module.register(ipc, makeGuard(true), makeLog(), makeDeps(makeManualMockBackup()));
    var r = await ipc._invoke('cloud:createManualBackup', {}, {});
    assert(!r.ok); assertEqual(r.error, 'invalid_input');
  });

  await testAsync('cloud-backup-ipc: createManualBackup — missing buildManualBackupArchive → backup_build_failed', async function() {
    var ipc = makeMockIpcMain();
    var deps = makeDeps(makeManualMockBackup(), { buildManualBackupArchive: undefined });
    ipc_module.register(ipc, makeGuard(true), makeLog(), deps);
    var r = await ipc._invoke('cloud:createManualBackup', {}, { workspaceId: WS_ID });
    assert(!r.ok); assertEqual(r.error, 'backup_build_failed');
  });

  await testAsync('cloud-backup-ipc: createManualBackup — build throws → backup_build_failed', async function() {
    var ipc = makeMockIpcMain();
    var deps = makeDeps(makeManualMockBackup(), {
      buildManualBackupArchive: function() { throw new Error('disk full'); },
    });
    ipc_module.register(ipc, makeGuard(true), makeLog(), deps);
    var r = await ipc._invoke('cloud:createManualBackup', {}, { workspaceId: WS_ID });
    assert(!r.ok); assertEqual(r.error, 'backup_build_failed');
  });

  await testAsync('cloud-backup-ipc: createManualBackup — forwards archiveStr/byteSize/checksum to module', async function() {
    var ipc = makeMockIpcMain();
    var received = null;
    var backup = makeManualMockBackup({
      createManualCloudBackup: function(input) { received = input; return Promise.resolve({ ok: true, backupId: 'x', createdAt: 'now', byteSize: input.byteSize, trigger: 'manual' }); },
    });
    ipc_module.register(ipc, makeGuard(true), makeLog(), makeDeps(backup));
    var r = await ipc._invoke('cloud:createManualBackup', {}, { workspaceId: WS_ID });
    assert(r.ok, 'must succeed');
    assert(received !== null, 'module must have been called');
    assertEqual(received.workspaceId, WS_ID);
    assert(typeof received.archiveStr === 'string' && received.archiveStr.length > 0, 'archiveStr forwarded');
    assertEqual(received.byteSize, 4096);
    assertEqual(received.checksum, GOOD_CHECKSUM);
  });

  await testAsync('cloud-backup-ipc: createManualBackup — success: returns only safe fields, no storagePath/checksum/deviceId', async function() {
    var ipc = makeMockIpcMain();
    ipc_module.register(ipc, makeGuard(true), makeLog(), makeDeps(makeManualMockBackup()));
    var r = await ipc._invoke('cloud:createManualBackup', {}, { workspaceId: WS_ID });
    assert(r.ok, 'must succeed');
    assert(!('storagePath' in r),   'storagePath must not reach renderer');
    assert(!('checksum' in r),       'raw checksum must not reach renderer');
    assert(!('archiveStr' in r),     'archiveStr must not reach renderer');
    assert(!('device_id' in r),      'device_id must not reach renderer');
    assert(!('access_token' in r),   'access_token must not reach renderer');
    var keys = Object.keys(r).sort().join(',');
    assertEqual(keys, 'backupId,byteSize,createdAt,ok,trigger');
  });

  await testAsync('cloud-backup-ipc: createManualBackup — module returns error → error passed through sanitized', async function() {
    var ipc = makeMockIpcMain();
    var backup = makeManualMockBackup({
      createManualCloudBackup: function() { return Promise.resolve({ ok: false, error: 'upload_failed' }); },
    });
    ipc_module.register(ipc, makeGuard(true), makeLog(), makeDeps(backup));
    var r = await ipc._invoke('cloud:createManualBackup', {}, { workspaceId: WS_ID });
    assert(!r.ok); assertEqual(r.error, 'upload_failed');
  });

  await testAsync('cloud-backup-ipc: createManualBackup — exception in module → unknown_error', async function() {
    var ipc = makeMockIpcMain();
    var backup = makeManualMockBackup({
      createManualCloudBackup: function() { throw new Error('crash'); },
    });
    ipc_module.register(ipc, makeGuard(true), makeLog(), makeDeps(backup));
    var r = await ipc._invoke('cloud:createManualBackup', {}, { workspaceId: WS_ID });
    assert(!r.ok); assertEqual(r.error, 'unknown_error');
  });

  await testAsync('cloud-backup-ipc: createManualBackup — never calls restore/downloadUrl/syncApply (no write scope creep)', async function() {
    var ipc = makeMockIpcMain();
    var backup = makeManualMockBackup();
    var forbidden = ['restoreBackup', 'createBackupDownloadUrl', 'syncApply', 'pushSnapshot'];
    forbidden.forEach(function(name) {
      backup[name] = function() { throw new Error('forbidden method called: ' + name); };
    });
    ipc_module.register(ipc, makeGuard(true), makeLog(), makeDeps(backup));
    var r = await ipc._invoke('cloud:createManualBackup', {}, { workspaceId: WS_ID });
    assert(r.ok, 'succeeded without any forbidden method being called');
  });
}

module.exports = { register, registerAsync };
