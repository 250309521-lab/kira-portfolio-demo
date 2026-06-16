'use strict';

const ws = require('../cloud/cloud-workspace');

// Ensure isConfigured() returns true for all tests.
// In local dev the .env.local file sets these; in CI we provide test defaults.
if (!process.env.SUPABASE_URL)            process.env.SUPABASE_URL            = 'http://localhost:54321';
if (!process.env.SUPABASE_PUBLISHABLE_KEY) process.env.SUPABASE_PUBLISHABLE_KEY = 'test-anon-key';

// ── Mock helpers ──────────────────────────────────────────────────────────────

function makeOkFetch(payload) {
  return function() {
    return Promise.resolve({
      ok:     true,
      status: 200,
      json:   function() { return Promise.resolve(payload); },
    });
  };
}

function makeErrorFetch(status, body) {
  return function() {
    return Promise.resolve({
      ok:     false,
      status: status || 500,
      json:   function() { return Promise.resolve(body || {}); },
    });
  };
}

function makeThrowFetch() {
  return function() { return Promise.reject(new TypeError('fetch failed')); };
}

function makeMockAuth(authenticated, userId) {
  return {
    getAccessToken: function() {
      return Promise.resolve(authenticated ? 'test-access-token' : null);
    },
    getSessionMeta: function() {
      if (!authenticated) return { ok: false };
      return { ok: true, userId: userId || 'test-user-id', email: 'test@example.com', expiresAt: Date.now() + 3600000 };
    },
    isAuthenticated: function() { return authenticated; },
  };
}

function makeMockStore(existingDeviceId) {
  var _stored = existingDeviceId !== undefined ? existingDeviceId : null;
  return {
    loadDeviceId:   function()  { return _stored; },
    saveDeviceId:   function(u) { _stored = u; return true; },
    deleteDeviceId: function()  { _stored = null; },
    _get:           function()  { return _stored; },
  };
}

// ── Sync tests ────────────────────────────────────────────────────────────────

function register(test, assert, assertEqual) {

  console.log('\nCloud Workspace — Workspace Name Validation:');

  test('cloud-workspace: validateWorkspaceName — plain name ok', function() {
    assert(ws._validateWorkspaceName('My Workspace'));
  });
  test('cloud-workspace: validateWorkspaceName — empty string rejected', function() {
    assert(!ws._validateWorkspaceName(''));
  });
  test('cloud-workspace: validateWorkspaceName — whitespace-only rejected', function() {
    assert(!ws._validateWorkspaceName('   '));
  });
  test('cloud-workspace: validateWorkspaceName — 255 chars ok', function() {
    assert(ws._validateWorkspaceName('a'.repeat(255)));
  });
  test('cloud-workspace: validateWorkspaceName — 256 chars rejected', function() {
    assert(!ws._validateWorkspaceName('a'.repeat(256)));
  });
  test('cloud-workspace: validateWorkspaceName — null rejected', function() {
    assert(!ws._validateWorkspaceName(null));
  });
  test('cloud-workspace: validateWorkspaceName — number rejected', function() {
    assert(!ws._validateWorkspaceName(123));
  });

  console.log('\nCloud Workspace — LocalWorkspaceId Validation:');

  test('cloud-workspace: validateLocalWorkspaceId — valid id ok', function() {
    assert(ws._validateLocalWorkspaceId('ws_local_abc123'));
  });
  test('cloud-workspace: validateLocalWorkspaceId — empty rejected', function() {
    assert(!ws._validateLocalWorkspaceId(''));
  });
  test('cloud-workspace: validateLocalWorkspaceId — whitespace-only rejected', function() {
    assert(!ws._validateLocalWorkspaceId('   '));
  });
  test('cloud-workspace: validateLocalWorkspaceId — 128 chars ok', function() {
    assert(ws._validateLocalWorkspaceId('a'.repeat(128)));
  });
  test('cloud-workspace: validateLocalWorkspaceId — 129 chars rejected', function() {
    assert(!ws._validateLocalWorkspaceId('a'.repeat(129)));
  });
  test('cloud-workspace: validateLocalWorkspaceId — null rejected', function() {
    assert(!ws._validateLocalWorkspaceId(null));
  });

  console.log('\nCloud Workspace — Error Normalization:');

  test('cloud-workspace: normalizeError 401 → permission_denied', function() {
    assertEqual(ws._normalizeError(401, {}), 'permission_denied');
  });
  test('cloud-workspace: normalizeError 403 → permission_denied', function() {
    assertEqual(ws._normalizeError(403, {}), 'permission_denied');
  });
  test('cloud-workspace: normalizeError 404 → workspace_not_found', function() {
    assertEqual(ws._normalizeError(404, {}), 'workspace_not_found');
  });
  test('cloud-workspace: normalizeError — local_workspace_id_conflict → workspace_conflict', function() {
    assertEqual(ws._normalizeError(200, { ok: false, error: 'local_workspace_id_conflict' }), 'workspace_conflict');
  });
  test('cloud-workspace: normalizeError — workspace_not_found from body', function() {
    assertEqual(ws._normalizeError(200, { ok: false, error: 'workspace_not_found' }), 'workspace_not_found');
  });
  test('cloud-workspace: normalizeError — permission_denied from body', function() {
    assertEqual(ws._normalizeError(200, { ok: false, error: 'permission_denied' }), 'permission_denied');
  });
  test('cloud-workspace: normalizeError — 500 unknown → unknown_error', function() {
    assertEqual(ws._normalizeError(500, {}), 'unknown_error');
  });
  test('cloud-workspace: normalizeError — null body → unknown_error', function() {
    assertEqual(ws._normalizeError(500, null), 'unknown_error');
  });
  test('cloud-workspace: normalizeError — not_member → workspace_not_found (CLOUD-FOUNDATION-1F.3)', function() {
    assertEqual(ws._normalizeError(200, { ok: false, error: 'not_member' }), 'workspace_not_found');
  });

  console.log('\nCloud Workspace — WorkspaceId Validation (CLOUD-FOUNDATION-1F.3):');

  test('cloud-workspace: validateWorkspaceId — non-empty string ok', function() {
    assert(ws._validateWorkspaceId('ws-uuid-1'));
  });
  test('cloud-workspace: validateWorkspaceId — empty string rejected', function() {
    assert(!ws._validateWorkspaceId(''));
  });
  test('cloud-workspace: validateWorkspaceId — whitespace-only rejected', function() {
    assert(!ws._validateWorkspaceId('   '));
  });
  test('cloud-workspace: validateWorkspaceId — null rejected', function() {
    assert(!ws._validateWorkspaceId(null));
  });
  test('cloud-workspace: validateWorkspaceId — number rejected', function() {
    assert(!ws._validateWorkspaceId(42));
  });
}

// ── Async tests ───────────────────────────────────────────────────────────────

async function registerAsync(testAsync, assert, assertEqual) {

  // ── Device UUID persistence ─────────────────────────────────────────────────

  await testAsync('cloud-workspace: getOrCreateDeviceId — creates UUID when store is empty', async function() {
    ws._resetForTests();
    var mockStore = makeMockStore(null);
    ws._setStore(mockStore);
    ws._setUUID(function() { return 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'; });
    var id = await ws.getOrCreateDeviceId();
    assertEqual(id, 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', 'must return generated UUID');
    assertEqual(mockStore._get(), 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', 'must persist UUID to store');
    ws._resetForTests();
  });

  await testAsync('cloud-workspace: getOrCreateDeviceId — loads existing UUID without generating a new one', async function() {
    ws._resetForTests();
    var existingId = 'ffffffff-0000-4111-8222-333333333333';
    var mockStore = makeMockStore(existingId);
    ws._setStore(mockStore);
    var uuidCallCount = 0;
    ws._setUUID(function() { uuidCallCount++; return 'should-never-be-used'; });
    var id = await ws.getOrCreateDeviceId();
    assertEqual(id, existingId, 'must return the stored UUID');
    assertEqual(uuidCallCount, 0, 'must not call UUID generator when store already has a value');
    ws._resetForTests();
  });

  await testAsync('cloud-workspace: getOrCreateDeviceId — consecutive calls return same ID', async function() {
    ws._resetForTests();
    var mockStore = makeMockStore(null);
    ws._setStore(mockStore);
    var callCount = 0;
    ws._setUUID(function() { callCount++; return 'cccccccc-dddd-4eee-8fff-000000000000'; });
    var id1 = await ws.getOrCreateDeviceId();
    var id2 = await ws.getOrCreateDeviceId();
    assertEqual(id1, id2, 'both calls must return the same UUID');
    assertEqual(callCount, 1, 'UUID generator must be called exactly once');
    ws._resetForTests();
  });

  // ── createWorkspace — input validation ─────────────────────────────────────

  await testAsync('cloud-workspace: createWorkspace — empty name → invalid_input', async function() {
    ws._resetForTests();
    ws._setAuth(makeMockAuth(true));
    var r = await ws.createWorkspace({ name: '', localWorkspaceId: 'ws_local' });
    assert(r.ok === false, 'must return ok:false');
    assertEqual(r.error, 'invalid_input');
    ws._resetForTests();
  });

  await testAsync('cloud-workspace: createWorkspace — whitespace-only name → invalid_input', async function() {
    ws._resetForTests();
    ws._setAuth(makeMockAuth(true));
    var r = await ws.createWorkspace({ name: '   ', localWorkspaceId: 'ws_local' });
    assert(r.ok === false, 'must return ok:false');
    assertEqual(r.error, 'invalid_input');
    ws._resetForTests();
  });

  await testAsync('cloud-workspace: createWorkspace — name > 255 chars → invalid_input', async function() {
    ws._resetForTests();
    ws._setAuth(makeMockAuth(true));
    var r = await ws.createWorkspace({ name: 'a'.repeat(256), localWorkspaceId: 'ws_local' });
    assert(r.ok === false, 'must return ok:false');
    assertEqual(r.error, 'invalid_input');
    ws._resetForTests();
  });

  await testAsync('cloud-workspace: createWorkspace — localWorkspaceId > 128 → invalid_input', async function() {
    ws._resetForTests();
    ws._setAuth(makeMockAuth(true));
    var r = await ws.createWorkspace({ name: 'Test WS', localWorkspaceId: 'a'.repeat(129) });
    assert(r.ok === false, 'must return ok:false');
    assertEqual(r.error, 'invalid_input');
    ws._resetForTests();
  });

  await testAsync('cloud-workspace: createWorkspace — no access token → not_authenticated', async function() {
    ws._resetForTests();
    ws._setAuth(makeMockAuth(false));
    var r = await ws.createWorkspace({ name: 'Test WS', localWorkspaceId: 'ws_local' });
    assert(r.ok === false, 'must return ok:false');
    assertEqual(r.error, 'not_authenticated');
    ws._resetForTests();
  });

  await testAsync('cloud-workspace: createWorkspace — workspace_conflict maps correctly', async function() {
    ws._resetForTests();
    ws._setAuth(makeMockAuth(true));
    ws._setFetch(makeOkFetch({ ok: false, error: 'local_workspace_id_conflict' }));
    var r = await ws.createWorkspace({ name: 'Test WS', localWorkspaceId: 'dup_local_id' });
    assert(r.ok === false, 'must return ok:false');
    assertEqual(r.error, 'workspace_conflict');
    ws._resetForTests();
  });

  await testAsync('cloud-workspace: createWorkspace — network error → network_error', async function() {
    ws._resetForTests();
    ws._setAuth(makeMockAuth(true));
    ws._setFetch(makeThrowFetch());
    var r = await ws.createWorkspace({ name: 'Test WS', localWorkspaceId: 'ws_local' });
    assert(r.ok === false, 'must return ok:false');
    assertEqual(r.error, 'network_error');
    ws._resetForTests();
  });

  // ── listWorkspaces — response mapping ──────────────────────────────────────

  await testAsync('cloud-workspace: listWorkspaces — maps PostgREST row to safe metadata fields', async function() {
    ws._resetForTests();
    ws._setAuth(makeMockAuth(true));
    ws._setFetch(makeOkFetch([
      {
        member_role:  'owner',
        workspace_id: '8315dd29-db0a-4f55-bc52-156fd57e37c1',
        workspaces: {
          id:                 '8315dd29-db0a-4f55-bc52-156fd57e37c1',
          name:               'Test Workspace',
          local_workspace_id: 'ws_local_abc',
          owner_id:           'user-id-123',
        },
      },
    ]));
    var r = await ws.listWorkspaces();
    assert(r.ok === true, 'must return ok:true');
    assert(Array.isArray(r.workspaces), 'workspaces must be an array');
    assertEqual(r.workspaces.length, 1, 'must have one workspace');
    assertEqual(r.workspaces[0].workspaceId,      '8315dd29-db0a-4f55-bc52-156fd57e37c1');
    assertEqual(r.workspaces[0].localWorkspaceId, 'ws_local_abc');
    assertEqual(r.workspaces[0].workspaceName,    'Test Workspace');
    assertEqual(r.workspaces[0].memberRole,       'owner');
    ws._resetForTests();
  });

  await testAsync('cloud-workspace: listWorkspaces — empty array returns ok:true with empty workspaces', async function() {
    ws._resetForTests();
    ws._setAuth(makeMockAuth(true));
    ws._setFetch(makeOkFetch([]));
    var r = await ws.listWorkspaces();
    assert(r.ok === true, 'must return ok:true');
    assertEqual(r.workspaces.length, 0, 'workspaces array must be empty');
    ws._resetForTests();
  });

  await testAsync('cloud-workspace: listWorkspaces — response contains no token fields', async function() {
    ws._resetForTests();
    ws._setAuth(makeMockAuth(true));
    ws._setFetch(makeOkFetch([{
      member_role: 'owner', workspace_id: 'ws1',
      workspaces: { id: 'ws1', name: 'WS', local_workspace_id: 'l1', owner_id: 'u1' },
    }]));
    var r = await ws.listWorkspaces();
    assert(!('access_token'  in r), 'access_token must not appear in response');
    assert(!('refresh_token' in r), 'refresh_token must not appear in response');
    ws._resetForTests();
  });

  // ── registerDevice — never exposes deviceId ────────────────────────────────

  await testAsync('cloud-workspace: registerDevice — response never contains deviceId', async function() {
    ws._resetForTests();
    ws._setAuth(makeMockAuth(true));
    ws._setStore(makeMockStore(null));
    ws._setUUID(function() { return 'aaaaaaaa-1111-4222-8333-444444444444'; });
    ws._setFetch(makeOkFetch({ ok: true, device_id: 'aaaaaaaa-1111-4222-8333-444444444444' }));
    var r = await ws.registerDevice();
    assert(r.ok === true, 'must return ok:true');
    assert(!('deviceId'  in r), 'deviceId must not appear in response');
    assert(!('device_id' in r), 'device_id must not appear in response');
    assertEqual(r.deviceRegistered, true, 'deviceRegistered must be true');
    ws._resetForTests();
  });

  // ── getSyncStatus (CLOUD-FOUNDATION-1F.3, read-only) ────────────────────────

  await testAsync('cloud-workspace: getSyncStatus — not_configured when cloud not configured', async function() {
    ws._resetForTests();
    var prevUrl = process.env.SUPABASE_URL;
    var prevKey = process.env.SUPABASE_PUBLISHABLE_KEY;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_PUBLISHABLE_KEY;
    var r = await ws.getSyncStatus('ws-1');
    assertEqual(r.error, 'not_configured');
    process.env.SUPABASE_URL = prevUrl;
    process.env.SUPABASE_PUBLISHABLE_KEY = prevKey;
    ws._resetForTests();
  });

  await testAsync('cloud-workspace: getSyncStatus — empty workspaceId → invalid_input', async function() {
    ws._resetForTests();
    ws._setAuth(makeMockAuth(true));
    var r = await ws.getSyncStatus('');
    assert(r.ok === false, 'must return ok:false');
    assertEqual(r.error, 'invalid_input');
    ws._resetForTests();
  });

  await testAsync('cloud-workspace: getSyncStatus — no access token → not_authenticated', async function() {
    ws._resetForTests();
    ws._setAuth(makeMockAuth(false));
    var r = await ws.getSyncStatus('ws-1');
    assert(r.ok === false, 'must return ok:false');
    assertEqual(r.error, 'not_authenticated');
    ws._resetForTests();
  });

  await testAsync('cloud-workspace: getSyncStatus — success returns sanitized fields, free lock', async function() {
    ws._resetForTests();
    ws._setAuth(makeMockAuth(true));
    ws._setFetch(makeOkFetch({
      ok: true, current_revision: 7, lock_free: true,
      lock_held_by: 'user-uuid-should-not-leak', lock_expires_at: null,
    }));
    var r = await ws.getSyncStatus('ws-1');
    assert(r.ok === true, 'must return ok:true');
    assertEqual(r.currentRevision, 7);
    assertEqual(r.lockFree, true);
    assertEqual(r.lockExpiresAt, null);
    assert(!('lock_held_by' in r), 'lock_held_by must never be returned');
    assert(!('lockHeldBy'   in r), 'lockHeldBy must never be returned');
    ws._resetForTests();
  });

  await testAsync('cloud-workspace: getSyncStatus — success returns lockExpiresAt when locked, omits lock holder', async function() {
    ws._resetForTests();
    ws._setAuth(makeMockAuth(true));
    ws._setFetch(makeOkFetch({
      ok: true, current_revision: 3, lock_free: false,
      lock_held_by: 'user-uuid-should-not-leak', lock_expires_at: '2026-06-20T00:00:00Z',
    }));
    var r = await ws.getSyncStatus('ws-1');
    assert(r.ok === true, 'must return ok:true');
    assertEqual(r.lockFree, false);
    assertEqual(r.lockExpiresAt, '2026-06-20T00:00:00Z');
    assert(!('lock_held_by' in r), 'lock_held_by must never be returned');
    ws._resetForTests();
  });

  await testAsync('cloud-workspace: getSyncStatus — not_member maps to workspace_not_found', async function() {
    ws._resetForTests();
    ws._setAuth(makeMockAuth(true));
    ws._setFetch(makeOkFetch({ ok: false, error: 'not_member' }));
    var r = await ws.getSyncStatus('ws-1');
    assert(r.ok === false, 'must return ok:false');
    assertEqual(r.error, 'workspace_not_found');
    ws._resetForTests();
  });

  await testAsync('cloud-workspace: getSyncStatus — network error → network_error', async function() {
    ws._resetForTests();
    ws._setAuth(makeMockAuth(true));
    ws._setFetch(makeThrowFetch());
    var r = await ws.getSyncStatus('ws-1');
    assert(r.ok === false, 'must return ok:false');
    assertEqual(r.error, 'network_error');
    ws._resetForTests();
  });

  // ── getLatestSnapshotMetadata (CLOUD-FOUNDATION-1F.3, read-only) ───────────

  await testAsync('cloud-workspace: getLatestSnapshotMetadata — empty workspaceId → invalid_input', async function() {
    ws._resetForTests();
    ws._setAuth(makeMockAuth(true));
    var r = await ws.getLatestSnapshotMetadata('   ');
    assert(r.ok === false, 'must return ok:false');
    assertEqual(r.error, 'invalid_input');
    ws._resetForTests();
  });

  await testAsync('cloud-workspace: getLatestSnapshotMetadata — no access token → not_authenticated', async function() {
    ws._resetForTests();
    ws._setAuth(makeMockAuth(false));
    var r = await ws.getLatestSnapshotMetadata('ws-1');
    assert(r.ok === false, 'must return ok:false');
    assertEqual(r.error, 'not_authenticated');
    ws._resetForTests();
  });

  await testAsync('cloud-workspace: getLatestSnapshotMetadata — success returns sanitized snapshot, omits storage_path/hash/pushed_by', async function() {
    ws._resetForTests();
    ws._setAuth(makeMockAuth(true));
    ws._setFetch(makeOkFetch({
      ok: true,
      snapshot: {
        id: 'snap-1', revision: 7, snapshot_hash: 'sha-should-not-leak',
        storage_path: '/should/not/leak', byte_size: 1024,
        pushed_by: 'user-uuid-should-not-leak', created_at: '2026-06-15T12:00:00Z',
      },
    }));
    var r = await ws.getLatestSnapshotMetadata('ws-1');
    assert(r.ok === true, 'must return ok:true');
    assert(r.snapshot !== null, 'snapshot must not be null');
    assertEqual(r.snapshot.revision,  7);
    assertEqual(r.snapshot.createdAt, '2026-06-15T12:00:00Z');
    assertEqual(r.snapshot.byteSize,  1024);
    assert(!('storage_path'  in r.snapshot), 'storage_path must never be returned');
    assert(!('snapshot_hash' in r.snapshot), 'snapshot_hash must never be returned');
    assert(!('pushed_by'     in r.snapshot), 'pushed_by must never be returned');
    ws._resetForTests();
  });

  await testAsync('cloud-workspace: getLatestSnapshotMetadata — no snapshot yet returns ok:true, snapshot:null', async function() {
    ws._resetForTests();
    ws._setAuth(makeMockAuth(true));
    ws._setFetch(makeOkFetch({ ok: true, snapshot: null }));
    var r = await ws.getLatestSnapshotMetadata('ws-1');
    assert(r.ok === true, 'must return ok:true');
    assertEqual(r.snapshot, null, 'snapshot must be null when none exists yet');
    ws._resetForTests();
  });

  await testAsync('cloud-workspace: getLatestSnapshotMetadata — not_member maps to workspace_not_found', async function() {
    ws._resetForTests();
    ws._setAuth(makeMockAuth(true));
    ws._setFetch(makeOkFetch({ ok: false, error: 'not_member' }));
    var r = await ws.getLatestSnapshotMetadata('ws-1');
    assert(r.ok === false, 'must return ok:false');
    assertEqual(r.error, 'workspace_not_found');
    ws._resetForTests();
  });

  await testAsync('cloud-workspace: getLatestSnapshotMetadata — network error → network_error', async function() {
    ws._resetForTests();
    ws._setAuth(makeMockAuth(true));
    ws._setFetch(makeThrowFetch());
    var r = await ws.getLatestSnapshotMetadata('ws-1');
    assert(r.ok === false, 'must return ok:false');
    assertEqual(r.error, 'network_error');
    ws._resetForTests();
  });

  // ── No write RPCs called by read-only functions ─────────────────────────────

  await testAsync('cloud-workspace: getSyncStatus only calls get_sync_status RPC, never a write RPC', async function() {
    ws._resetForTests();
    ws._setAuth(makeMockAuth(true));
    var calledUrls = [];
    ws._setFetch(function(url) {
      calledUrls.push(url);
      return Promise.resolve({ ok: true, status: 200, json: function() {
        return Promise.resolve({ ok: true, current_revision: 1, lock_free: true });
      } });
    });
    await ws.getSyncStatus('ws-1');
    assert(calledUrls.length === 1, 'exactly one fetch call expected');
    assert(/\/rpc\/get_sync_status$/.test(calledUrls[0]), 'must call get_sync_status RPC');
    assert(!/push_snapshot|create_workspace|register_device|apply|restore/.test(calledUrls[0]),
      'must never call a write RPC');
    ws._resetForTests();
  });

  await testAsync('cloud-workspace: getLatestSnapshotMetadata only calls get_latest_snapshot_metadata RPC, never a write RPC', async function() {
    ws._resetForTests();
    ws._setAuth(makeMockAuth(true));
    var calledUrls = [];
    ws._setFetch(function(url) {
      calledUrls.push(url);
      return Promise.resolve({ ok: true, status: 200, json: function() {
        return Promise.resolve({ ok: true, snapshot: null });
      } });
    });
    await ws.getLatestSnapshotMetadata('ws-1');
    assert(calledUrls.length === 1, 'exactly one fetch call expected');
    assert(/\/rpc\/get_latest_snapshot_metadata$/.test(calledUrls[0]), 'must call get_latest_snapshot_metadata RPC');
    assert(!/push_snapshot|create_workspace|register_device|apply|restore/.test(calledUrls[0]),
      'must never call a write RPC');
    ws._resetForTests();
  });
}

module.exports = { register, registerAsync };
