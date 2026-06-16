'use strict';

const ws = require('../cloud/workspace-state');

// ── Mock helpers ──────────────────────────────────────────────────────────────

function makeMockBridge(overrides) {
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
        ok: true, workspaceId: 'ws-new-001', workspaceName: payload.name || 'New WS',
      });
    },
    activateWorkspace: function(opts) {
      _track('activateWorkspace', [opts]);
      return Promise.resolve({
        ok: true, workspaceId: opts.workspaceId, workspaceName: 'Test WS', memberRole: 'owner',
      });
    },
  };
  var bridge = Object.assign({}, base, overrides || {});
  bridge._calls = _calls;
  return bridge;
}

function makeMockStorage(initial) {
  var _store = Object.assign({}, initial || {});
  return {
    getItem:    function(k) { return _store.hasOwnProperty(k) ? _store[k] : null; },
    setItem:    function(k, v) { _store[k] = String(v); },
    removeItem: function(k) { delete _store[k]; },
    _data:      _store,
  };
}

// ── Sync tests ────────────────────────────────────────────────────────────────

function register(test, assert, assertEqual) {

  console.log('\nWorkspace State — Initial State:');

  test('workspace-state: getState() returns correct initial values', function() {
    ws._resetForTests();
    var s = ws.getState();
    assert(s.activeWorkspaceId   === null,    'activeWorkspaceId must be null initially');
    assert(s.activeWorkspaceName === null,    'activeWorkspaceName must be null initially');
    assert(s.memberRole          === null,    'memberRole must be null initially');
    assert(Array.isArray(s.workspaces),       'workspaces must be an array');
    assert(s.workspaces.length   === 0,       'workspaces must be empty initially');
    assert(s.loading             === false,   'loading must be false initially');
    assert(s.lastError           === null,    'lastError must be null initially');
    ws._resetForTests();
  });

  test('workspace-state: getState() exposes no sensitive fields', function() {
    ws._resetForTests();
    var s = ws.getState();
    var forbidden = ['deviceId', 'device_id', 'token', 'access_token', 'refresh_token',
                     'supabaseKey', 'service_role'];
    forbidden.forEach(function(k) {
      assert(!(k in s), 'getState() must not expose: ' + k);
    });
    ws._resetForTests();
  });

  test('workspace-state: getState().workspaces is a copy, not the internal array', function() {
    ws._resetForTests();
    var s1 = ws.getState();
    s1.workspaces.push({ workspaceId: 'injected' });
    var s2 = ws.getState();
    assert(s2.workspaces.length === 0, 'mutating the snapshot must not affect internal state');
    ws._resetForTests();
  });

  console.log('\nWorkspace State — Error Normalization:');

  test('workspace-state: _normalizeError passes through known errors unchanged', function() {
    var known = ['not_authenticated', 'network_error', 'workspace_not_found',
                 'workspace_conflict', 'unknown_error'];
    known.forEach(function(e) {
      assertEqual(ws._normalizeError(e), e, 'known error must pass through: ' + e);
    });
  });

  test('workspace-state: _normalizeError maps unknown string to unknown_error', function() {
    assertEqual(ws._normalizeError('permission_denied'), 'unknown_error');
    assertEqual(ws._normalizeError('not_configured'),    'unknown_error');
    assertEqual(ws._normalizeError('some_other_error'),  'unknown_error');
  });

  test('workspace-state: _normalizeError maps non-string to unknown_error', function() {
    assertEqual(ws._normalizeError(null),      'unknown_error');
    assertEqual(ws._normalizeError(undefined), 'unknown_error');
    assertEqual(ws._normalizeError(500),       'unknown_error');
  });

  console.log('\nWorkspace State — reset():');

  test('workspace-state: reset() clears all in-memory state and persisted ID', function() {
    ws._resetForTests();
    var mockStorage = makeMockStorage({ 'ktp_active_workspace_id': 'ws-old' });
    ws._setStorage(mockStorage);
    // Manually set some state to test reset clears it.
    // We use _resetForTests only for seams; here we call reset() which is the public API.
    // First load a fake state by calling _resetForTests then manually tweak _state through reset().
    ws.reset(); // should clear storage too
    var s = ws.getState();
    assert(s.activeWorkspaceId === null,   'reset must clear activeWorkspaceId');
    assert(s.workspaces.length === 0,      'reset must clear workspaces');
    assert(s.lastError         === null,   'reset must clear lastError');
    assert(mockStorage._data['ktp_active_workspace_id'] === undefined,
      'reset must remove persisted ID from storage');
    ws._resetForTests();
  });
}

// ── Async tests ───────────────────────────────────────────────────────────────

async function registerAsync(testAsync, assert, assertEqual) {

  // ── loadWorkspaces ─────────────────────────────────────────────────────────

  await testAsync('workspace-state: loadWorkspaces() populates state.workspaces on success', async function() {
    ws._resetForTests();
    var mockBridge = makeMockBridge({
      listWorkspaces: function() {
        return Promise.resolve({
          ok: true,
          workspaces: [
            { workspaceId: 'ws-001', workspaceName: 'Main',   memberRole: 'owner' },
            { workspaceId: 'ws-002', workspaceName: 'Backup', memberRole: 'member' },
          ],
        });
      },
    });
    ws._setBridge(mockBridge);
    var r = await ws.loadWorkspaces();
    assert(r.ok === true,                       'must return ok:true');
    assertEqual(ws.getState().workspaces.length, 2, 'must populate 2 workspaces');
    assertEqual(ws.getState().workspaces[0].workspaceId, 'ws-001');
    assert(ws.getState().loading === false,      'loading must be false after completion');
    ws._resetForTests();
  });

  await testAsync('workspace-state: loadWorkspaces() sets lastError on bridge ok:false', async function() {
    ws._resetForTests();
    ws._setBridge(makeMockBridge({
      listWorkspaces: function() {
        return Promise.resolve({ ok: false, error: 'not_authenticated' });
      },
    }));
    var r = await ws.loadWorkspaces();
    assert(r.ok === false,                              'must return ok:false');
    assertEqual(r.error, 'not_authenticated',           'error must be not_authenticated');
    assertEqual(ws.getState().lastError, 'not_authenticated', 'lastError must be set');
    ws._resetForTests();
  });

  await testAsync('workspace-state: loadWorkspaces() normalizes unknown bridge error to unknown_error', async function() {
    ws._resetForTests();
    ws._setBridge(makeMockBridge({
      listWorkspaces: function() {
        return Promise.resolve({ ok: false, error: 'permission_denied' });
      },
    }));
    var r = await ws.loadWorkspaces();
    assertEqual(r.error, 'unknown_error', 'non-standard error must normalize to unknown_error');
    ws._resetForTests();
  });

  await testAsync('workspace-state: loadWorkspaces() sets unknown_error when bridge throws', async function() {
    ws._resetForTests();
    ws._setBridge(makeMockBridge({
      listWorkspaces: function() { throw new Error('unexpected'); },
    }));
    var r = await ws.loadWorkspaces();
    assert(r.ok === false,                  'must return ok:false on throw');
    assertEqual(r.error, 'unknown_error',   'thrown error must map to unknown_error');
    ws._resetForTests();
  });

  // ── createWorkspace ────────────────────────────────────────────────────────

  await testAsync('workspace-state: createWorkspace() returns ok:true and refreshes workspace list', async function() {
    ws._resetForTests();
    var listCallCount = 0;
    ws._setBridge(makeMockBridge({
      listWorkspaces: function() {
        listCallCount++;
        return Promise.resolve({
          ok: true,
          workspaces: [{ workspaceId: 'ws-new-001', workspaceName: 'New WS', memberRole: 'owner' }],
        });
      },
    }));
    var r = await ws.createWorkspace({ name: 'New WS', localWorkspaceId: 'ws_new' });
    assert(r.ok === true,                                     'must return ok:true');
    assertEqual(r.workspaceId, 'ws-new-001',                  'must return the new workspaceId');
    assert(listCallCount >= 1,                                'must refresh workspace list after creation');
    assertEqual(ws.getState().workspaces.length, 1,           'state.workspaces must be refreshed');
    ws._resetForTests();
  });

  await testAsync('workspace-state: createWorkspace() sets lastError on bridge failure', async function() {
    ws._resetForTests();
    ws._setBridge(makeMockBridge({
      createWorkspace: function() {
        return Promise.resolve({ ok: false, error: 'workspace_conflict' });
      },
    }));
    var r = await ws.createWorkspace({ name: 'Dup WS', localWorkspaceId: 'dup_id' });
    assert(r.ok === false,                                  'must return ok:false');
    assertEqual(r.error, 'workspace_conflict',             'error must be workspace_conflict');
    assertEqual(ws.getState().lastError, 'workspace_conflict', 'lastError must be set');
    ws._resetForTests();
  });

  await testAsync('workspace-state: createWorkspace() sets unknown_error when bridge throws', async function() {
    ws._resetForTests();
    ws._setBridge(makeMockBridge({
      createWorkspace: function() { return Promise.reject(new Error('network gone')); },
    }));
    var r = await ws.createWorkspace({ name: 'WS', localWorkspaceId: 'ws_l' });
    assert(r.ok === false,                'must return ok:false on rejection');
    assertEqual(r.error, 'unknown_error', 'rejected promise must map to unknown_error');
    ws._resetForTests();
  });

  // ── activateWorkspace ──────────────────────────────────────────────────────

  await testAsync('workspace-state: activateWorkspace() updates activeWorkspaceId, workspaceName, memberRole in state', async function() {
    ws._resetForTests();
    ws._setBridge(makeMockBridge({
      activateWorkspace: function() {
        return Promise.resolve({
          ok: true, workspaceId: 'ws-act-001', workspaceName: 'Active WS', memberRole: 'member',
        });
      },
    }));
    ws._setStorage(makeMockStorage());
    var r = await ws.activateWorkspace({ workspaceId: 'ws-act-001' });
    assert(r.ok === true,                                          'must return ok:true');
    assertEqual(ws.getState().activeWorkspaceId,   'ws-act-001',   'state.activeWorkspaceId must be set');
    assertEqual(ws.getState().activeWorkspaceName, 'Active WS',    'state.activeWorkspaceName must be set');
    assertEqual(ws.getState().memberRole,          'member',       'state.memberRole must be set');
    assert(ws.getState().loading === false,                        'loading must be false after completion');
    ws._resetForTests();
  });

  await testAsync('workspace-state: activateWorkspace() persists activeWorkspaceId to storage', async function() {
    ws._resetForTests();
    ws._setBridge(makeMockBridge());
    var mockStorage = makeMockStorage();
    ws._setStorage(mockStorage);
    await ws.activateWorkspace({ workspaceId: 'ws-persist-001' });
    assertEqual(mockStorage._data['ktp_active_workspace_id'], 'ws-persist-001',
      'activeWorkspaceId must be saved to localStorage key');
    ws._resetForTests();
  });

  await testAsync('workspace-state: activateWorkspace() sets lastError on bridge failure', async function() {
    ws._resetForTests();
    ws._setBridge(makeMockBridge({
      activateWorkspace: function() {
        return Promise.resolve({ ok: false, error: 'workspace_not_found' });
      },
    }));
    var r = await ws.activateWorkspace({ workspaceId: 'ws-gone' });
    assert(r.ok === false,                                        'must return ok:false');
    assertEqual(r.error, 'workspace_not_found',                   'error must be workspace_not_found');
    assert(ws.getState().activeWorkspaceId === null,             'activeWorkspaceId must remain null on failure');
    ws._resetForTests();
  });

  // ── restore ────────────────────────────────────────────────────────────────

  await testAsync('workspace-state: restore() returns ok:true restored:false when no saved ID', async function() {
    ws._resetForTests();
    ws._setBridge(makeMockBridge());
    ws._setStorage(makeMockStorage()); // empty storage
    var r = await ws.restore();
    assert(r.ok === true,       'must return ok:true');
    assert(r.restored === false, 'restored must be false when storage has no ID');
    ws._resetForTests();
  });

  await testAsync('workspace-state: restore() with saved valid ID populates state from workspace list', async function() {
    ws._resetForTests();
    ws._setStorage(makeMockStorage({ 'ktp_active_workspace_id': 'ws-saved-001' }));
    ws._setBridge(makeMockBridge({
      listWorkspaces: function() {
        return Promise.resolve({
          ok: true,
          workspaces: [
            { workspaceId: 'ws-saved-001', workspaceName: 'Saved WS', memberRole: 'owner' },
          ],
        });
      },
    }));
    var r = await ws.restore();
    assert(r.ok === true,                                           'must return ok:true');
    assert(r.restored === true,                                     'restored must be true');
    assertEqual(r.workspaceId, 'ws-saved-001',                      'returned workspaceId must match');
    assertEqual(ws.getState().activeWorkspaceId,   'ws-saved-001', 'state.activeWorkspaceId must be set');
    assertEqual(ws.getState().activeWorkspaceName, 'Saved WS',     'state.activeWorkspaceName must be set');
    assertEqual(ws.getState().memberRole,          'owner',        'state.memberRole must be set');
    ws._resetForTests();
  });

  await testAsync('workspace-state: restore() clears storage when saved workspace no longer in list', async function() {
    ws._resetForTests();
    var mockStorage = makeMockStorage({ 'ktp_active_workspace_id': 'ws-gone-999' });
    ws._setStorage(mockStorage);
    ws._setBridge(makeMockBridge({
      listWorkspaces: function() {
        return Promise.resolve({ ok: true, workspaces: [] }); // ws-gone-999 not in list
      },
    }));
    var r = await ws.restore();
    assert(r.ok === true,                                                 'must return ok:true');
    assert(r.restored === false,                                          'restored must be false');
    assertEqual(r.reason, 'workspace_not_found',                          'reason must be workspace_not_found');
    assert(ws.getState().activeWorkspaceId === null,                      'activeWorkspaceId must be cleared');
    assert(mockStorage._data['ktp_active_workspace_id'] === undefined,    'persisted ID must be removed from storage');
    ws._resetForTests();
  });

  await testAsync('workspace-state: restore() propagates error when bridge fails', async function() {
    ws._resetForTests();
    ws._setStorage(makeMockStorage({ 'ktp_active_workspace_id': 'ws-offline-001' }));
    ws._setBridge(makeMockBridge({
      listWorkspaces: function() {
        return Promise.resolve({ ok: false, error: 'network_error' });
      },
    }));
    var r = await ws.restore();
    assert(r.ok === false,                 'must return ok:false when bridge fails');
    assertEqual(r.error, 'network_error',  'error must pass through from loadWorkspaces');
    // Optimistically keeps the ID in state so UI can show "offline but previously activated"
    assertEqual(ws.getState().activeWorkspaceId, 'ws-offline-001',
      'activeWorkspaceId must be held optimistically when bridge is unavailable');
    ws._resetForTests();
  });

  // ── No sensitive fields in state ───────────────────────────────────────────

  await testAsync('workspace-state: getState() never contains sensitive fields after activateWorkspace', async function() {
    ws._resetForTests();
    ws._setBridge(makeMockBridge({
      activateWorkspace: function() {
        return Promise.resolve({
          ok: true, workspaceId: 'ws-1', workspaceName: 'WS',
          memberRole: 'owner',
          // Simulate a hypothetical bug where the bridge leaks these:
          deviceId: 'secret', access_token: 'tok', supabaseKey: 'key',
        });
      },
    }));
    ws._setStorage(makeMockStorage());
    await ws.activateWorkspace({ workspaceId: 'ws-1' });
    var s = ws.getState();
    var forbidden = ['deviceId', 'device_id', 'token', 'access_token', 'refresh_token',
                     'supabaseKey', 'service_role'];
    forbidden.forEach(function(k) {
      assert(!(k in s), 'getState() must not expose after activation: ' + k);
    });
    ws._resetForTests();
  });
}

module.exports = { register, registerAsync };
