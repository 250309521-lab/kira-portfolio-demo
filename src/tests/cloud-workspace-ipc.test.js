'use strict';

const ipc_module = require('../cloud/cloud-workspace-ipc');

if (!process.env.SUPABASE_URL)             process.env.SUPABASE_URL             = 'http://localhost:54321';
if (!process.env.SUPABASE_PUBLISHABLE_KEY) process.env.SUPABASE_PUBLISHABLE_KEY = 'test-anon-key';

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

function makeMockWorkspace(overrides) {
  var _calls = {};
  function _track(name, args) {
    if (!_calls[name]) _calls[name] = [];
    _calls[name].push(args);
  }
  var base = {
    listWorkspaces: function() {
      _track('listWorkspaces', []);
      return Promise.resolve({ ok: true, workspaces: [] });
    },
    createWorkspace: function(payload) {
      _track('createWorkspace', [payload]);
      return Promise.resolve({
        ok: true,
        workspaceId:      'ws-uuid-001',
        localWorkspaceId: payload.localWorkspaceId,
        workspaceName:    payload.name,
      });
    },
    activateWorkspace: function(opts) {
      _track('activateWorkspace', [opts]);
      return Promise.resolve({ ok: true, workspaceId: opts.workspaceId, workspaceName: 'Test WS', memberRole: 'owner' });
    },
    getWorkspaceStatus: function() {
      _track('getWorkspaceStatus', []);
      return Promise.resolve({ ok: true, hasWorkspace: false, workspaces: [], userId: 'uid-1' });
    },
    getSyncStatus: function(workspaceId) {
      _track('getSyncStatus', [workspaceId]);
      return Promise.resolve({ ok: true, currentRevision: 1, lockFree: true, lockExpiresAt: null });
    },
    getLatestSnapshotMetadata: function(workspaceId) {
      _track('getLatestSnapshotMetadata', [workspaceId]);
      return Promise.resolve({ ok: true, snapshot: null });
    },
  };
  var ws = Object.assign({}, base, overrides || {});
  ws._calls = _calls;
  return ws;
}

function makeGuard(ok) {
  return function() {
    return Promise.resolve(ok ? { ok: true } : { ok: false, reason: 'license_required' });
  };
}

function makeLog() {
  var _lines = [];
  var fn = function(msg) { _lines.push(String(msg)); };
  fn._lines = _lines;
  return fn;
}

// ── Sync tests ────────────────────────────────────────────────────────────────

function register(test, assert, assertEqual) {

  console.log('\nCloud Workspace IPC — Channel Registration:');

  test('cloud-workspace-ipc: register creates all six required channels', function() {
    var ipc = makeMockIpcMain();
    ipc_module.register(ipc, makeGuard(true), makeLog(), makeMockWorkspace());
    assert(ipc._hasChannel('cloud:listWorkspaces'),    'cloud:listWorkspaces must be registered');
    assert(ipc._hasChannel('cloud:createWorkspace'),   'cloud:createWorkspace must be registered');
    assert(ipc._hasChannel('cloud:activateWorkspace'), 'cloud:activateWorkspace must be registered');
    assert(ipc._hasChannel('cloud:getWorkspaceStatus'),'cloud:getWorkspaceStatus must be registered');
    assert(ipc._hasChannel('cloud:getSyncStatus'),     'cloud:getSyncStatus must be registered (CLOUD-FOUNDATION-1F.3)');
    assert(ipc._hasChannel('cloud:getLatestSnapshotMetadata'), 'cloud:getLatestSnapshotMetadata must be registered (CLOUD-FOUNDATION-1F.3)');
  });

  console.log('\nCloud Workspace IPC — WorkspaceId Payload Validation (CLOUD-FOUNDATION-1F.3):');

  test('cloud-workspace-ipc: _validateWorkspaceIdPayload — valid payload ok', function() {
    assert(ipc_module._validateWorkspaceIdPayload({ workspaceId: 'ws-uuid-001' }) === true);
  });
  test('cloud-workspace-ipc: _validateWorkspaceIdPayload — null payload rejected', function() {
    assert(ipc_module._validateWorkspaceIdPayload(null) === false);
  });
  test('cloud-workspace-ipc: _validateWorkspaceIdPayload — missing workspaceId rejected', function() {
    assert(ipc_module._validateWorkspaceIdPayload({}) === false);
  });
  test('cloud-workspace-ipc: _validateWorkspaceIdPayload — whitespace-only workspaceId rejected', function() {
    assert(ipc_module._validateWorkspaceIdPayload({ workspaceId: '   ' }) === false);
  });

  console.log('\nCloud Workspace IPC — createWorkspace Payload Validation:');

  test('cloud-workspace-ipc: _validateCreatePayload — valid payload ok', function() {
    assert(ipc_module._validateCreatePayload({ name: 'My WS', localWorkspaceId: 'ws_local' }) === true);
  });
  test('cloud-workspace-ipc: _validateCreatePayload — null payload rejected', function() {
    assert(ipc_module._validateCreatePayload(null) === false);
  });
  test('cloud-workspace-ipc: _validateCreatePayload — missing name rejected', function() {
    assert(ipc_module._validateCreatePayload({ localWorkspaceId: 'ws_local' }) === false);
  });
  test('cloud-workspace-ipc: _validateCreatePayload — whitespace-only name rejected', function() {
    assert(ipc_module._validateCreatePayload({ name: '   ', localWorkspaceId: 'ws_local' }) === false);
  });
  test('cloud-workspace-ipc: _validateCreatePayload — name > 255 chars rejected', function() {
    assert(ipc_module._validateCreatePayload({ name: 'a'.repeat(256), localWorkspaceId: 'ws_local' }) === false);
  });
  test('cloud-workspace-ipc: _validateCreatePayload — missing localWorkspaceId rejected', function() {
    assert(ipc_module._validateCreatePayload({ name: 'WS' }) === false);
  });
  test('cloud-workspace-ipc: _validateCreatePayload — localWorkspaceId > 128 chars rejected', function() {
    assert(ipc_module._validateCreatePayload({ name: 'WS', localWorkspaceId: 'a'.repeat(129) }) === false);
  });

  console.log('\nCloud Workspace IPC — activateWorkspace Payload Validation:');

  test('cloud-workspace-ipc: _validateActivatePayload — valid payload ok', function() {
    assert(ipc_module._validateActivatePayload({ workspaceId: 'ws-uuid-001' }) === true);
  });
  test('cloud-workspace-ipc: _validateActivatePayload — null payload rejected', function() {
    assert(ipc_module._validateActivatePayload(null) === false);
  });
  test('cloud-workspace-ipc: _validateActivatePayload — missing workspaceId rejected', function() {
    assert(ipc_module._validateActivatePayload({}) === false);
  });
  test('cloud-workspace-ipc: _validateActivatePayload — whitespace-only workspaceId rejected', function() {
    assert(ipc_module._validateActivatePayload({ workspaceId: '   ' }) === false);
  });
}

// ── Async tests ───────────────────────────────────────────────────────────────

async function registerAsync(testAsync, assert, assertEqual) {

  // ── License gate ────────────────────────────────────────────────────────────

  await testAsync('cloud-workspace-ipc: cloud:listWorkspaces license block returns license_required', async function() {
    var ipc = makeMockIpcMain();
    var mockWs = makeMockWorkspace();
    ipc_module.register(ipc, makeGuard(false), makeLog(), mockWs);
    var r = await ipc._invoke('cloud:listWorkspaces');
    assert(r.ok === false,                   'ok must be false when license blocked');
    assertEqual(r.error, 'license_required', 'error must be license_required');
    assert(!mockWs._calls.listWorkspaces,    'workspace.listWorkspaces must not be called when license blocked');
  });

  await testAsync('cloud-workspace-ipc: cloud:createWorkspace license block returns license_required and does not call workspace', async function() {
    var ipc = makeMockIpcMain();
    var mockWs = makeMockWorkspace();
    ipc_module.register(ipc, makeGuard(false), makeLog(), mockWs);
    var r = await ipc._invoke('cloud:createWorkspace', {}, { name: 'WS', localWorkspaceId: 'ws_l' });
    assert(r.ok === false,                   'ok must be false when license blocked');
    assertEqual(r.error, 'license_required', 'error must be license_required');
    assert(!mockWs._calls.createWorkspace,   'workspace.createWorkspace must not be called when license blocked');
  });

  await testAsync('cloud-workspace-ipc: cloud:activateWorkspace license block returns license_required and does not call workspace', async function() {
    var ipc = makeMockIpcMain();
    var mockWs = makeMockWorkspace();
    ipc_module.register(ipc, makeGuard(false), makeLog(), mockWs);
    var r = await ipc._invoke('cloud:activateWorkspace', {}, { workspaceId: 'ws-001' });
    assert(r.ok === false,                    'ok must be false when license blocked');
    assertEqual(r.error, 'license_required',  'error must be license_required');
    assert(!mockWs._calls.activateWorkspace,  'workspace.activateWorkspace must not be called when license blocked');
  });

  await testAsync('cloud-workspace-ipc: cloud:getWorkspaceStatus license block returns license_required', async function() {
    var ipc = makeMockIpcMain();
    var mockWs = makeMockWorkspace();
    ipc_module.register(ipc, makeGuard(false), makeLog(), mockWs);
    var r = await ipc._invoke('cloud:getWorkspaceStatus');
    assert(r.ok === false,                    'ok must be false when license blocked');
    assertEqual(r.error, 'license_required',  'error must be license_required');
    assert(!mockWs._calls.getWorkspaceStatus, 'workspace.getWorkspaceStatus must not be called when license blocked');
  });

  await testAsync('cloud-workspace-ipc: cloud:getSyncStatus license block returns license_required and does not call workspace', async function() {
    var ipc = makeMockIpcMain();
    var mockWs = makeMockWorkspace();
    ipc_module.register(ipc, makeGuard(false), makeLog(), mockWs);
    var r = await ipc._invoke('cloud:getSyncStatus', {}, { workspaceId: 'ws-001' });
    assert(r.ok === false,                   'ok must be false when license blocked');
    assertEqual(r.error, 'license_required', 'error must be license_required');
    assert(!mockWs._calls.getSyncStatus,     'workspace.getSyncStatus must not be called when license blocked');
  });

  await testAsync('cloud-workspace-ipc: cloud:getLatestSnapshotMetadata license block returns license_required and does not call workspace', async function() {
    var ipc = makeMockIpcMain();
    var mockWs = makeMockWorkspace();
    ipc_module.register(ipc, makeGuard(false), makeLog(), mockWs);
    var r = await ipc._invoke('cloud:getLatestSnapshotMetadata', {}, { workspaceId: 'ws-001' });
    assert(r.ok === false,                            'ok must be false when license blocked');
    assertEqual(r.error, 'license_required',           'error must be license_required');
    assert(!mockWs._calls.getLatestSnapshotMetadata,   'workspace.getLatestSnapshotMetadata must not be called when license blocked');
  });

  // ── Input validation ───────────────────────────────────────────────────────

  await testAsync('cloud-workspace-ipc: cloud:createWorkspace null payload returns invalid_input', async function() {
    var ipc = makeMockIpcMain();
    ipc_module.register(ipc, makeGuard(true), makeLog(), makeMockWorkspace());
    var r = await ipc._invoke('cloud:createWorkspace', {}, null);
    assertEqual(r.error, 'invalid_input', 'null payload must return invalid_input');
  });

  await testAsync('cloud-workspace-ipc: cloud:createWorkspace whitespace-only name returns invalid_input', async function() {
    var ipc = makeMockIpcMain();
    ipc_module.register(ipc, makeGuard(true), makeLog(), makeMockWorkspace());
    var r = await ipc._invoke('cloud:createWorkspace', {}, { name: '   ', localWorkspaceId: 'ws_l' });
    assertEqual(r.error, 'invalid_input', 'whitespace-only name must return invalid_input');
  });

  await testAsync('cloud-workspace-ipc: cloud:createWorkspace name > 255 chars returns invalid_input', async function() {
    var ipc = makeMockIpcMain();
    ipc_module.register(ipc, makeGuard(true), makeLog(), makeMockWorkspace());
    var r = await ipc._invoke('cloud:createWorkspace', {}, { name: 'a'.repeat(256), localWorkspaceId: 'ws_l' });
    assertEqual(r.error, 'invalid_input', 'name > 255 chars must return invalid_input');
  });

  await testAsync('cloud-workspace-ipc: cloud:activateWorkspace null payload returns invalid_input', async function() {
    var ipc = makeMockIpcMain();
    ipc_module.register(ipc, makeGuard(true), makeLog(), makeMockWorkspace());
    var r = await ipc._invoke('cloud:activateWorkspace', {}, null);
    assertEqual(r.error, 'invalid_input', 'null payload must return invalid_input');
  });

  await testAsync('cloud-workspace-ipc: cloud:activateWorkspace empty workspaceId returns invalid_input', async function() {
    var ipc = makeMockIpcMain();
    ipc_module.register(ipc, makeGuard(true), makeLog(), makeMockWorkspace());
    var r = await ipc._invoke('cloud:activateWorkspace', {}, { workspaceId: '' });
    assertEqual(r.error, 'invalid_input', 'empty workspaceId must return invalid_input');
  });

  await testAsync('cloud-workspace-ipc: cloud:getSyncStatus null payload returns invalid_input', async function() {
    var ipc = makeMockIpcMain();
    ipc_module.register(ipc, makeGuard(true), makeLog(), makeMockWorkspace());
    var r = await ipc._invoke('cloud:getSyncStatus', {}, null);
    assertEqual(r.error, 'invalid_input', 'null payload must return invalid_input');
  });

  await testAsync('cloud-workspace-ipc: cloud:getSyncStatus empty workspaceId returns invalid_input', async function() {
    var ipc = makeMockIpcMain();
    ipc_module.register(ipc, makeGuard(true), makeLog(), makeMockWorkspace());
    var r = await ipc._invoke('cloud:getSyncStatus', {}, { workspaceId: '' });
    assertEqual(r.error, 'invalid_input', 'empty workspaceId must return invalid_input');
  });

  await testAsync('cloud-workspace-ipc: cloud:getLatestSnapshotMetadata null payload returns invalid_input', async function() {
    var ipc = makeMockIpcMain();
    ipc_module.register(ipc, makeGuard(true), makeLog(), makeMockWorkspace());
    var r = await ipc._invoke('cloud:getLatestSnapshotMetadata', {}, null);
    assertEqual(r.error, 'invalid_input', 'null payload must return invalid_input');
  });

  await testAsync('cloud-workspace-ipc: cloud:getLatestSnapshotMetadata empty workspaceId returns invalid_input', async function() {
    var ipc = makeMockIpcMain();
    ipc_module.register(ipc, makeGuard(true), makeLog(), makeMockWorkspace());
    var r = await ipc._invoke('cloud:getLatestSnapshotMetadata', {}, { workspaceId: '   ' });
    assertEqual(r.error, 'invalid_input', 'whitespace-only workspaceId must return invalid_input');
  });

  // ── Correct module invocation ──────────────────────────────────────────────

  await testAsync('cloud-workspace-ipc: cloud:listWorkspaces calls workspace.listWorkspaces', async function() {
    var ipc = makeMockIpcMain();
    var mockWs = makeMockWorkspace();
    ipc_module.register(ipc, makeGuard(true), makeLog(), mockWs);
    var r = await ipc._invoke('cloud:listWorkspaces');
    assert(r.ok === true, 'must return ok:true');
    assert(mockWs._calls.listWorkspaces && mockWs._calls.listWorkspaces.length === 1,
      'workspace.listWorkspaces must be called exactly once');
  });

  await testAsync('cloud-workspace-ipc: cloud:createWorkspace calls workspace.createWorkspace with name and localWorkspaceId', async function() {
    var ipc = makeMockIpcMain();
    var mockWs = makeMockWorkspace();
    ipc_module.register(ipc, makeGuard(true), makeLog(), mockWs);
    var r = await ipc._invoke('cloud:createWorkspace', {}, { name: 'Prod WS', localWorkspaceId: 'ws_prod_123' });
    assert(r.ok === true, 'must return ok:true');
    assert(mockWs._calls.createWorkspace && mockWs._calls.createWorkspace.length === 1,
      'workspace.createWorkspace must be called exactly once');
    assertEqual(mockWs._calls.createWorkspace[0][0].name,             'Prod WS',     'name must be forwarded');
    assertEqual(mockWs._calls.createWorkspace[0][0].localWorkspaceId, 'ws_prod_123', 'localWorkspaceId must be forwarded');
  });

  await testAsync('cloud-workspace-ipc: cloud:activateWorkspace calls workspace.activateWorkspace with workspaceId', async function() {
    var ipc = makeMockIpcMain();
    var mockWs = makeMockWorkspace();
    ipc_module.register(ipc, makeGuard(true), makeLog(), mockWs);
    var r = await ipc._invoke('cloud:activateWorkspace', {}, { workspaceId: 'ws-uuid-xyz' });
    assert(r.ok === true, 'must return ok:true');
    assert(mockWs._calls.activateWorkspace && mockWs._calls.activateWorkspace.length === 1,
      'workspace.activateWorkspace must be called exactly once');
    assertEqual(mockWs._calls.activateWorkspace[0][0].workspaceId, 'ws-uuid-xyz', 'workspaceId must be forwarded');
  });

  await testAsync('cloud-workspace-ipc: cloud:getWorkspaceStatus calls workspace.getWorkspaceStatus', async function() {
    var ipc = makeMockIpcMain();
    var mockWs = makeMockWorkspace();
    ipc_module.register(ipc, makeGuard(true), makeLog(), mockWs);
    var r = await ipc._invoke('cloud:getWorkspaceStatus');
    assert(r.ok === true, 'must return ok:true');
    assert(mockWs._calls.getWorkspaceStatus && mockWs._calls.getWorkspaceStatus.length === 1,
      'workspace.getWorkspaceStatus must be called exactly once');
  });

  await testAsync('cloud-workspace-ipc: cloud:getSyncStatus calls workspace.getSyncStatus with workspaceId', async function() {
    var ipc = makeMockIpcMain();
    var mockWs = makeMockWorkspace();
    ipc_module.register(ipc, makeGuard(true), makeLog(), mockWs);
    var r = await ipc._invoke('cloud:getSyncStatus', {}, { workspaceId: 'ws-uuid-xyz' });
    assert(r.ok === true, 'must return ok:true');
    assert(mockWs._calls.getSyncStatus && mockWs._calls.getSyncStatus.length === 1,
      'workspace.getSyncStatus must be called exactly once');
    assertEqual(mockWs._calls.getSyncStatus[0][0], 'ws-uuid-xyz', 'workspaceId must be forwarded');
  });

  await testAsync('cloud-workspace-ipc: cloud:getLatestSnapshotMetadata calls workspace.getLatestSnapshotMetadata with workspaceId', async function() {
    var ipc = makeMockIpcMain();
    var mockWs = makeMockWorkspace();
    ipc_module.register(ipc, makeGuard(true), makeLog(), mockWs);
    var r = await ipc._invoke('cloud:getLatestSnapshotMetadata', {}, { workspaceId: 'ws-uuid-xyz' });
    assert(r.ok === true, 'must return ok:true');
    assert(mockWs._calls.getLatestSnapshotMetadata && mockWs._calls.getLatestSnapshotMetadata.length === 1,
      'workspace.getLatestSnapshotMetadata must be called exactly once');
    assertEqual(mockWs._calls.getLatestSnapshotMetadata[0][0], 'ws-uuid-xyz', 'workspaceId must be forwarded');
  });

  // ── No write methods invoked by read-only channels ─────────────────────────

  await testAsync('cloud-workspace-ipc: cloud:getSyncStatus never calls any write-capable workspace method', async function() {
    var ipc = makeMockIpcMain();
    var mockWs = makeMockWorkspace();
    ipc_module.register(ipc, makeGuard(true), makeLog(), mockWs);
    await ipc._invoke('cloud:getSyncStatus', {}, { workspaceId: 'ws-1' });
    assert(!mockWs._calls.createWorkspace,   'createWorkspace must not be called');
    assert(!mockWs._calls.activateWorkspace, 'activateWorkspace must not be called');
  });

  await testAsync('cloud-workspace-ipc: cloud:getLatestSnapshotMetadata never calls any write-capable workspace method', async function() {
    var ipc = makeMockIpcMain();
    var mockWs = makeMockWorkspace();
    ipc_module.register(ipc, makeGuard(true), makeLog(), mockWs);
    await ipc._invoke('cloud:getLatestSnapshotMetadata', {}, { workspaceId: 'ws-1' });
    assert(!mockWs._calls.createWorkspace,   'createWorkspace must not be called');
    assert(!mockWs._calls.activateWorkspace, 'activateWorkspace must not be called');
  });

  // ── Response scrubbing ─────────────────────────────────────────────────────

  await testAsync('cloud-workspace-ipc: response strips deviceId and device_id', async function() {
    var ipc = makeMockIpcMain();
    ipc_module.register(ipc, makeGuard(true), makeLog(), makeMockWorkspace({
      listWorkspaces: function() {
        return Promise.resolve({ ok: true, workspaces: [], deviceId: 'SECRET', device_id: 'ALSO_SECRET' });
      },
    }));
    var r = await ipc._invoke('cloud:listWorkspaces');
    assert(!('deviceId'  in r), 'deviceId must be stripped from IPC response');
    assert(!('device_id' in r), 'device_id must be stripped from IPC response');
  });

  await testAsync('cloud-workspace-ipc: response strips access_token and refresh_token', async function() {
    var ipc = makeMockIpcMain();
    ipc_module.register(ipc, makeGuard(true), makeLog(), makeMockWorkspace({
      createWorkspace: function() {
        return Promise.resolve({ ok: true, workspaceId: 'ws-1', access_token: 'TOK', refresh_token: 'RTOK' });
      },
    }));
    var r = await ipc._invoke('cloud:createWorkspace', {}, { name: 'WS', localWorkspaceId: 'ws_l' });
    assert(!('access_token'  in r), 'access_token must be stripped');
    assert(!('refresh_token' in r), 'refresh_token must be stripped');
  });

  await testAsync('cloud-workspace-ipc: response strips machineFingerprint licenseJson supabaseKey service_role', async function() {
    var ipc = makeMockIpcMain();
    ipc_module.register(ipc, makeGuard(true), makeLog(), makeMockWorkspace({
      getWorkspaceStatus: function() {
        return Promise.resolve({
          ok: true, hasWorkspace: false, workspaces: [], userId: 'u1',
          machineFingerprint: 'fp', licenseJson: 'lj', supabaseKey: 'sk', service_role: 'sr',
        });
      },
    }));
    var r = await ipc._invoke('cloud:getWorkspaceStatus');
    assert(!('machineFingerprint' in r), 'machineFingerprint must be stripped');
    assert(!('licenseJson'        in r), 'licenseJson must be stripped');
    assert(!('supabaseKey'        in r), 'supabaseKey must be stripped');
    assert(!('service_role'       in r), 'service_role must be stripped');
  });

  await testAsync('cloud-workspace-ipc: cloud:getSyncStatus response strips device_id and access_token if present', async function() {
    var ipc = makeMockIpcMain();
    ipc_module.register(ipc, makeGuard(true), makeLog(), makeMockWorkspace({
      getSyncStatus: function() {
        return Promise.resolve({
          ok: true, currentRevision: 1, lockFree: true,
          device_id: 'SECRET', access_token: 'TOK',
        });
      },
    }));
    var r = await ipc._invoke('cloud:getSyncStatus', {}, { workspaceId: 'ws-1' });
    assert(!('device_id'     in r), 'device_id must be stripped');
    assert(!('access_token'  in r), 'access_token must be stripped');
  });

  await testAsync('cloud-workspace-ipc: cloud:getLatestSnapshotMetadata response strips service_role and refresh_token if present', async function() {
    var ipc = makeMockIpcMain();
    ipc_module.register(ipc, makeGuard(true), makeLog(), makeMockWorkspace({
      getLatestSnapshotMetadata: function() {
        return Promise.resolve({
          ok: true, snapshot: { revision: 1, createdAt: '2026-06-15T00:00:00Z', byteSize: 10 },
          service_role: 'SR', refresh_token: 'RTOK',
        });
      },
    }));
    var r = await ipc._invoke('cloud:getLatestSnapshotMetadata', {}, { workspaceId: 'ws-1' });
    assert(!('service_role'  in r), 'service_role must be stripped');
    assert(!('refresh_token' in r), 'refresh_token must be stripped');
  });

  // ── Exception handling ─────────────────────────────────────────────────────

  await testAsync('cloud-workspace-ipc: workspace.listWorkspaces throw returns unknown_error', async function() {
    var ipc = makeMockIpcMain();
    ipc_module.register(ipc, makeGuard(true), makeLog(), makeMockWorkspace({
      listWorkspaces: function() { throw new Error('unexpected internal failure'); },
    }));
    var r = await ipc._invoke('cloud:listWorkspaces');
    assert(r.ok === false,                'ok must be false on throw');
    assertEqual(r.error, 'unknown_error', 'error must be unknown_error');
  });

  await testAsync('cloud-workspace-ipc: workspace.createWorkspace throw returns unknown_error without stack trace', async function() {
    var ipc = makeMockIpcMain();
    ipc_module.register(ipc, makeGuard(true), makeLog(), makeMockWorkspace({
      createWorkspace: function() { throw new Error('Token: secret-token password: hunter2'); },
    }));
    var r = await ipc._invoke('cloud:createWorkspace', {}, { name: 'WS', localWorkspaceId: 'ws_l' });
    assert(r.ok === false,                'ok must be false on throw');
    assertEqual(r.error, 'unknown_error', 'error must be unknown_error');
    var rStr = JSON.stringify(r);
    assert(!rStr.includes('secret-token'), 'response must not contain the thrown error message');
    assert(!rStr.includes('hunter2'),      'response must not leak any password from the error');
  });

  await testAsync('cloud-workspace-ipc: workspace.activateWorkspace throw returns unknown_error', async function() {
    var ipc = makeMockIpcMain();
    ipc_module.register(ipc, makeGuard(true), makeLog(), makeMockWorkspace({
      activateWorkspace: function() { return Promise.reject(new Error('network gone')); },
    }));
    var r = await ipc._invoke('cloud:activateWorkspace', {}, { workspaceId: 'ws-001' });
    assert(r.ok === false,                'ok must be false on rejected promise');
    assertEqual(r.error, 'unknown_error', 'error must be unknown_error');
  });

  await testAsync('cloud-workspace-ipc: workspace.getSyncStatus throw returns unknown_error', async function() {
    var ipc = makeMockIpcMain();
    ipc_module.register(ipc, makeGuard(true), makeLog(), makeMockWorkspace({
      getSyncStatus: function() { return Promise.reject(new Error('network gone')); },
    }));
    var r = await ipc._invoke('cloud:getSyncStatus', {}, { workspaceId: 'ws-001' });
    assert(r.ok === false,                'ok must be false on rejected promise');
    assertEqual(r.error, 'unknown_error', 'error must be unknown_error');
  });

  await testAsync('cloud-workspace-ipc: workspace.getLatestSnapshotMetadata throw returns unknown_error', async function() {
    var ipc = makeMockIpcMain();
    ipc_module.register(ipc, makeGuard(true), makeLog(), makeMockWorkspace({
      getLatestSnapshotMetadata: function() { return Promise.reject(new Error('network gone')); },
    }));
    var r = await ipc._invoke('cloud:getLatestSnapshotMetadata', {}, { workspaceId: 'ws-001' });
    assert(r.ok === false,                'ok must be false on rejected promise');
    assertEqual(r.error, 'unknown_error', 'error must be unknown_error');
  });
}

module.exports = { register, registerAsync };
