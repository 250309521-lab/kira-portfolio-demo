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

  test('preload: cloudWorkspace exposes no forbidden keys', function() {
    var mock = makeElectronMock();
    loadPreload(mock);
    var api = mock._worlds.cloudWorkspace;
    FORBIDDEN_KEYS.forEach(function(k) {
      assert(!(k in api), 'cloudWorkspace must not expose key: ' + k);
    });
  });

  test('preload: cloudWorkspace exposes exactly the four expected methods and nothing else', function() {
    var mock = makeElectronMock();
    loadPreload(mock);
    var keys = Object.keys(mock._worlds.cloudWorkspace).sort();
    var expected = ['activateWorkspace', 'createWorkspace', 'getWorkspaceStatus', 'listWorkspaces'];
    assertEqual(keys.join(','), expected.join(','),
      'cloudWorkspace must expose exactly the four workspace methods');
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
}

module.exports = { register, registerAsync };
