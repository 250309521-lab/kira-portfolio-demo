'use strict';

const Module = require('module');
const path   = require('path');

const PRELOAD_PATH = path.join(__dirname, '..', 'preload.js');

// Keys that must never appear on the cloudWorkspace bridge.
const FORBIDDEN_KEYS = [
  'deviceId', 'device' + '_id',
  'token', 'access' + '_token', 'refresh' + '_token',
  'supabaseKey', 'service' + '_role',
  'machineFingerprint',
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeElectronMock() {
  var _worlds     = {};
  var _invokeLog  = [];
  return {
    contextBridge: {
      exposeInMainWorld: function(name, api) { _worlds[name] = api; },
    },
    ipcRenderer: {
      invoke: function() {
        var args = Array.prototype.slice.call(arguments);
        _invokeLog.push({ channel: args[0], payload: args[1] });
        return Promise.resolve({ ok: true, _mocked: true });
      },
      send: function() {},
    },
    _worlds:    _worlds,
    _invokeLog: _invokeLog,
  };
}

function loadPreload(electronMock) {
  delete require.cache[PRELOAD_PATH];
  var origLoad = Module._load;
  Module._load = function(id, parent, isMain) {
    if (id === 'electron') return electronMock;
    return origLoad.call(this, id, parent, isMain);
  };
  try {
    require(PRELOAD_PATH);
  } finally {
    Module._load = origLoad;
    delete require.cache[PRELOAD_PATH];
  }
}

// ── Sync tests ────────────────────────────────────────────────────────────────

function register(test, assert, assertEqual) {

  console.log('\nPreload Bridge — cloudWorkspace (CLOUD-FOUNDATION-1E.4):');

  test('preload: cloudWorkspace bridge is registered as a separate world', function() {
    var mock = makeElectronMock();
    loadPreload(mock);
    assert('cloudWorkspace' in mock._worlds, 'cloudWorkspace must be registered via exposeInMainWorld');
  });

  test('preload: cloudWorkspace.listWorkspaces is a function', function() {
    var mock = makeElectronMock();
    loadPreload(mock);
    assert(typeof mock._worlds.cloudWorkspace.listWorkspaces === 'function',
      'listWorkspaces must be a function');
  });

  test('preload: cloudWorkspace.createWorkspace is a function', function() {
    var mock = makeElectronMock();
    loadPreload(mock);
    assert(typeof mock._worlds.cloudWorkspace.createWorkspace === 'function',
      'createWorkspace must be a function');
  });

  test('preload: cloudWorkspace.activateWorkspace is a function', function() {
    var mock = makeElectronMock();
    loadPreload(mock);
    assert(typeof mock._worlds.cloudWorkspace.activateWorkspace === 'function',
      'activateWorkspace must be a function');
  });

  test('preload: cloudWorkspace.getWorkspaceStatus is a function', function() {
    var mock = makeElectronMock();
    loadPreload(mock);
    assert(typeof mock._worlds.cloudWorkspace.getWorkspaceStatus === 'function',
      'getWorkspaceStatus must be a function');
  });

  test('preload: cloudWorkspace.getSyncStatus is a function (CLOUD-FOUNDATION-1F.3)', function() {
    var mock = makeElectronMock();
    loadPreload(mock);
    assert(typeof mock._worlds.cloudWorkspace.getSyncStatus === 'function',
      'getSyncStatus must be a function');
  });

  test('preload: cloudWorkspace.getLatestSnapshotMetadata is a function (CLOUD-FOUNDATION-1F.3)', function() {
    var mock = makeElectronMock();
    loadPreload(mock);
    assert(typeof mock._worlds.cloudWorkspace.getLatestSnapshotMetadata === 'function',
      'getLatestSnapshotMetadata must be a function');
  });

  test('preload: cloudWorkspace exposes no forbidden keys', function() {
    var mock = makeElectronMock();
    loadPreload(mock);
    var api = mock._worlds.cloudWorkspace;
    FORBIDDEN_KEYS.forEach(function(k) {
      assert(!(k in api), 'cloudWorkspace must not expose key: ' + k);
    });
  });

  test('preload: cloudWorkspace exposes exactly the six expected methods and nothing else', function() {
    var mock = makeElectronMock();
    loadPreload(mock);
    var keys = Object.keys(mock._worlds.cloudWorkspace).sort();
    var expected = [
      'activateWorkspace', 'createWorkspace', 'getLatestSnapshotMetadata',
      'getSyncStatus', 'getWorkspaceStatus', 'listWorkspaces',
    ].sort();
    assertEqual(keys.join(','), expected.join(','),
      'cloudWorkspace must expose exactly the six workspace methods');
  });

  test('preload: cloudWorkspace is separate from window.electron', function() {
    var mock = makeElectronMock();
    loadPreload(mock);
    assert('electron'        in mock._worlds, 'electron bridge must exist');
    assert('cloudWorkspace'  in mock._worlds, 'cloudWorkspace bridge must exist');
    assert(mock._worlds.electron !== mock._worlds.cloudWorkspace,
      'electron and cloudWorkspace must be different objects');
    assert(!('listWorkspaces' in mock._worlds.electron),
      'listWorkspaces must not appear on the electron bridge');
  });

  // ── Cloud Backup bridge (CLOUD-FOUNDATION-1F.4A) ────────────────────────────

  test('preload: cloudBackup bridge is registered as a separate world', function() {
    var mock = makeElectronMock();
    loadPreload(mock);
    assert('cloudBackup' in mock._worlds, 'cloudBackup must be registered via exposeInMainWorld');
  });

  test('preload: cloudBackup.getCloudBackupReadiness is a function', function() {
    var mock = makeElectronMock();
    loadPreload(mock);
    assert(typeof mock._worlds.cloudBackup.getCloudBackupReadiness === 'function',
      'getCloudBackupReadiness must be a function');
  });

  test('preload: cloudBackup.buildCloudBackupPreflight is a function', function() {
    var mock = makeElectronMock();
    loadPreload(mock);
    assert(typeof mock._worlds.cloudBackup.buildCloudBackupPreflight === 'function',
      'buildCloudBackupPreflight must be a function');
  });

  test('preload: cloudBackup exposes no forbidden keys', function() {
    var mock = makeElectronMock();
    loadPreload(mock);
    var api = mock._worlds.cloudBackup;
    FORBIDDEN_KEYS.forEach(function(k) {
      assert(!(k in api), 'cloudBackup must not expose key: ' + k);
    });
  });

  test('preload: cloudBackup exposes exactly the three expected methods and nothing else (CLOUD-FOUNDATION-1F.4B)', function() {
    var mock = makeElectronMock();
    loadPreload(mock);
    var keys = Object.keys(mock._worlds.cloudBackup).sort();
    var expected = ['buildCloudBackupPreflight', 'createManualBackup', 'getCloudBackupReadiness'].sort();
    assertEqual(keys.join(','), expected.join(','),
      'cloudBackup must expose exactly the three readiness/preflight/upload methods');
  });

  test('preload: cloudBackup.createManualBackup is a function (CLOUD-FOUNDATION-1F.4B)', function() {
    var mock = makeElectronMock();
    loadPreload(mock);
    assert(typeof mock._worlds.cloudBackup.createManualBackup === 'function',
      'createManualBackup must be a function');
  });

  test('preload: cloudBackup exposes no forbidden restore/sync methods', function() {
    var mock = makeElectronMock();
    loadPreload(mock);
    var api = mock._worlds.cloudBackup;
    ['uploadBackup', 'createBackup', 'restoreBackup', 'applyBackup',
     'createCloudBackupMetadata', 'pushSnapshot', 'syncApply'].forEach(function(k) {
      assert(!(k in api), 'cloudBackup must not expose method: ' + k);
    });
  });
}

// ── Async tests ───────────────────────────────────────────────────────────────

async function registerAsync(testAsync, assert, assertEqual) {

  await testAsync('preload: listWorkspaces() invokes cloud:listWorkspaces channel', async function() {
    var mock = makeElectronMock();
    loadPreload(mock);
    await mock._worlds.cloudWorkspace.listWorkspaces();
    assert(mock._invokeLog.some(function(e) { return e.channel === 'cloud:listWorkspaces'; }),
      'cloud:listWorkspaces must be invoked');
  });

  await testAsync('preload: createWorkspace(payload) invokes cloud:createWorkspace with payload forwarded', async function() {
    var mock = makeElectronMock();
    loadPreload(mock);
    var payload = { name: 'Test WS', localWorkspaceId: 'ws_test_123' };
    await mock._worlds.cloudWorkspace.createWorkspace(payload);
    var entry = mock._invokeLog.find(function(e) { return e.channel === 'cloud:createWorkspace'; });
    assert(entry !== undefined, 'cloud:createWorkspace must be invoked');
    assertEqual(entry.payload.name,             'Test WS',      'payload.name must be forwarded');
    assertEqual(entry.payload.localWorkspaceId, 'ws_test_123',  'payload.localWorkspaceId must be forwarded');
  });

  await testAsync('preload: activateWorkspace(payload) invokes cloud:activateWorkspace with payload forwarded', async function() {
    var mock = makeElectronMock();
    loadPreload(mock);
    var payload = { workspaceId: 'ws-uuid-test-001' };
    await mock._worlds.cloudWorkspace.activateWorkspace(payload);
    var entry = mock._invokeLog.find(function(e) { return e.channel === 'cloud:activateWorkspace'; });
    assert(entry !== undefined, 'cloud:activateWorkspace must be invoked');
    assertEqual(entry.payload.workspaceId, 'ws-uuid-test-001', 'payload.workspaceId must be forwarded');
  });

  await testAsync('preload: getWorkspaceStatus() invokes cloud:getWorkspaceStatus channel', async function() {
    var mock = makeElectronMock();
    loadPreload(mock);
    await mock._worlds.cloudWorkspace.getWorkspaceStatus();
    assert(mock._invokeLog.some(function(e) { return e.channel === 'cloud:getWorkspaceStatus'; }),
      'cloud:getWorkspaceStatus must be invoked');
  });

  await testAsync('preload: getSyncStatus(payload) invokes cloud:getSyncStatus with payload forwarded (CLOUD-FOUNDATION-1F.3)', async function() {
    var mock = makeElectronMock();
    loadPreload(mock);
    var payload = { workspaceId: 'ws-uuid-test-001' };
    await mock._worlds.cloudWorkspace.getSyncStatus(payload);
    var entry = mock._invokeLog.find(function(e) { return e.channel === 'cloud:getSyncStatus'; });
    assert(entry !== undefined, 'cloud:getSyncStatus must be invoked');
    assertEqual(entry.payload.workspaceId, 'ws-uuid-test-001', 'payload.workspaceId must be forwarded');
  });

  await testAsync('preload: getLatestSnapshotMetadata(payload) invokes cloud:getLatestSnapshotMetadata with payload forwarded (CLOUD-FOUNDATION-1F.3)', async function() {
    var mock = makeElectronMock();
    loadPreload(mock);
    var payload = { workspaceId: 'ws-uuid-test-001' };
    await mock._worlds.cloudWorkspace.getLatestSnapshotMetadata(payload);
    var entry = mock._invokeLog.find(function(e) { return e.channel === 'cloud:getLatestSnapshotMetadata'; });
    assert(entry !== undefined, 'cloud:getLatestSnapshotMetadata must be invoked');
    assertEqual(entry.payload.workspaceId, 'ws-uuid-test-001', 'payload.workspaceId must be forwarded');
  });

  await testAsync('preload: getCloudBackupReadiness(payload) invokes cloud:getCloudBackupReadiness with payload forwarded (CLOUD-FOUNDATION-1F.4A)', async function() {
    var mock = makeElectronMock();
    loadPreload(mock);
    var payload = { workspaceId: 'ws-uuid-test-001' };
    await mock._worlds.cloudBackup.getCloudBackupReadiness(payload);
    var entry = mock._invokeLog.find(function(e) { return e.channel === 'cloud:getCloudBackupReadiness'; });
    assert(entry !== undefined, 'cloud:getCloudBackupReadiness must be invoked');
    assertEqual(entry.payload.workspaceId, 'ws-uuid-test-001', 'payload.workspaceId must be forwarded');
  });

  await testAsync('preload: buildCloudBackupPreflight(payload) invokes cloud:buildCloudBackupPreflight with payload forwarded (CLOUD-FOUNDATION-1F.4A)', async function() {
    var mock = makeElectronMock();
    loadPreload(mock);
    var payload = { workspaceId: 'ws-uuid-test-001', rendererState: '{}' };
    await mock._worlds.cloudBackup.buildCloudBackupPreflight(payload);
    var entry = mock._invokeLog.find(function(e) { return e.channel === 'cloud:buildCloudBackupPreflight'; });
    assert(entry !== undefined, 'cloud:buildCloudBackupPreflight must be invoked');
    assertEqual(entry.payload.workspaceId, 'ws-uuid-test-001', 'payload.workspaceId must be forwarded');
  });

  await testAsync('preload: createManualBackup(payload) invokes cloud:createManualBackup with payload forwarded (CLOUD-FOUNDATION-1F.4B)', async function() {
    var mock = makeElectronMock();
    loadPreload(mock);
    var payload = { workspaceId: 'ws-uuid-test-001', rendererState: '{"a":1}' };
    await mock._worlds.cloudBackup.createManualBackup(payload);
    var entry = mock._invokeLog.find(function(e) { return e.channel === 'cloud:createManualBackup'; });
    assert(entry !== undefined, 'cloud:createManualBackup must be invoked');
    assertEqual(entry.payload.workspaceId, 'ws-uuid-test-001', 'payload.workspaceId must be forwarded');
    assertEqual(entry.payload.rendererState, '{"a":1}', 'payload.rendererState must be forwarded');
  });
}

module.exports = { register, registerAsync };
