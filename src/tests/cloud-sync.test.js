'use strict';

// CLOUD-FOUNDATION-1G.2 — Real Sync auto-push (CAS) tests.

if (!process.env.SUPABASE_URL)             process.env.SUPABASE_URL             = 'http://localhost:54321';
if (!process.env.SUPABASE_PUBLISHABLE_KEY) process.env.SUPABASE_PUBLISHABLE_KEY = 'test-anon-key';

const cs     = require('../cloud/cloud-sync');
const csIpc  = require('../cloud/cloud-sync-ipc');

var WS_ID = '22222222-2222-2222-2222-222222222222';
var GOOD_HASH = 'a'.repeat(64);
var GOOD_SNAP = JSON.stringify({ buildings: [], tenants: {}, payments: {} });

function makeMockAuth(authenticated) {
  return {
    getSessionMeta: function() { return authenticated ? { ok: true, userId: 'u1' } : { ok: false }; },
    getAccessToken: async function() { return authenticated ? 'mock-jwt' : null; },
  };
}

function makeMockWorkspace(role) {
  return {
    listWorkspaces: function() {
      return Promise.resolve({ ok: true, workspaces: [{ workspaceId: WS_ID, memberRole: role || 'owner' }] });
    },
  };
}

// Configurable fetch mock counting each endpoint.
function makeFetch(overrides) {
  overrides = overrides || {};
  var calls = { acquire: 0, upload: 0, push: 0, release: 0, delete: 0 };
  var fn = async function(url, opts) {
    if (url.indexOf('/rest/v1/rpc/acquire_lock') !== -1) {
      calls.acquire++;
      if (overrides.locked) return { ok: true, json: async function() { return { ok: false, error: 'locked' }; } };
      if (overrides.acquireDenied) return { ok: true, json: async function() { return { ok: false, error: 'permission_denied' }; } };
      return { ok: true, json: async function() { return { ok: true, lease_token: 'lease-abc', expires_at: '2099-01-01T00:00:00Z' }; } };
    }
    if (url.indexOf('/rest/v1/rpc/push_snapshot_with_revision_check') !== -1) {
      calls.push++;
      if (overrides.stale) return { ok: true, json: async function() { return { ok: false, error: 'stale', current_revision: 7 }; } };
      if (overrides.pushDenied) return { ok: true, json: async function() { return { ok: false, error: 'permission_denied' }; } };
      return { ok: true, json: async function() { return { ok: true, new_revision: (overrides.baseRevision || 0) + 1 }; } };
    }
    if (url.indexOf('/rest/v1/rpc/release_lock') !== -1) {
      calls.release++;
      return { ok: true, json: async function() { return { ok: true }; } };
    }
    if (url.indexOf('/storage/v1/object/') !== -1) {
      if (opts && opts.method === 'DELETE') { calls.delete++; return { ok: true }; }
      calls.upload++;
      return { ok: !overrides.uploadFail };
    }
    return { ok: true, json: async function() { return { ok: true }; } };
  };
  fn._calls = calls;
  return fn;
}

function setup(opts) {
  opts = opts || {};
  cs._setAuth(makeMockAuth(opts.authOk !== false));
  cs._setWorkspace(makeMockWorkspace(opts.role || 'owner'));
  var fetch = opts.fetch || makeFetch(opts.overrides);
  cs._setFetch(fetch);
  return fetch;
}

function baseInput(extra) {
  return Object.assign({
    workspaceId:  WS_ID,
    baseRevision: 0,
    snapshotStr:  GOOD_SNAP,
    byteSize:     Buffer.byteLength(GOOD_SNAP, 'utf8'),
    snapshotHash: GOOD_HASH,
    deviceId:     '33333333-3333-3333-3333-333333333333',
  }, extra || {});
}

// ── Sync tests ────────────────────────────────────────────────────────────────
function register(test, assert, assertEqual) {
  console.log('\nCloud Sync — CAS push contract (CLOUD-FOUNDATION-1G.2):');

  test('cloud-sync: PUSH_ROLES are owner/admin/editor only (no viewer)', function() {
    assertEqual(cs.PUSH_ROLES.join(','), 'owner,admin,editor');
    assert(cs.PUSH_ROLES.indexOf('viewer') === -1, 'viewer must not be a push role');
  });

  test('cloud-sync: _snapshotPath is workspace-scoped, revisioned, .ktpsnap', function() {
    var p = cs._snapshotPath(WS_ID, 5, GOOD_HASH);
    assert(p.indexOf('workspaces/' + WS_ID + '/') === 0, 'must be workspace-scoped');
    assert(p.indexOf('5_') !== -1, 'must include the target revision');
    assert(/\.ktpsnap$/.test(p), 'must end in .ktpsnap');
    assert(!/device/i.test(p), 'must not embed a device id');
  });

  test('cloud-sync: computeSnapshotHash returns deterministic sha256 hex', function() {
    var h1 = cs.computeSnapshotHash(GOOD_SNAP);
    var h2 = cs.computeSnapshotHash(GOOD_SNAP);
    assert(/^[0-9a-f]{64}$/.test(h1), 'must be 64-char hex');
    assertEqual(h1, h2, 'same input must hash identically');
    assert(cs.computeSnapshotHash(GOOD_SNAP + 'x') !== h1, 'different input must differ');
  });

  test('cloud-sync: MAX_SNAPSHOT_BYTES is 100MB; bucket is ktp-snapshots', function() {
    assertEqual(cs.MAX_SNAPSHOT_BYTES, 100 * 1024 * 1024);
    assertEqual(cs.SNAPSHOT_BUCKET, 'ktp-snapshots');
  });

  // ── IPC sanitization (sync) ──────────────────────────────────────────────
  test('cloud-sync-ipc: _validatePushPayload requires workspaceId/rendererState/baseRevision', function() {
    assert(!csIpc._validatePushPayload(null));
    assert(!csIpc._validatePushPayload({ rendererState: '{}', baseRevision: 0 }), 'missing workspaceId');
    assert(!csIpc._validatePushPayload({ workspaceId: WS_ID, baseRevision: 0 }), 'missing rendererState');
    assert(!csIpc._validatePushPayload({ workspaceId: WS_ID, rendererState: '{}' }), 'missing baseRevision');
    assert(!csIpc._validatePushPayload({ workspaceId: WS_ID, rendererState: '{}', baseRevision: -1 }), 'negative revision');
    assert(!csIpc._validatePushPayload({ workspaceId: WS_ID, rendererState: '{}', baseRevision: 1.5 }), 'non-integer revision');
    assert(csIpc._validatePushPayload({ workspaceId: WS_ID, rendererState: '{}', baseRevision: 0 }), 'valid payload');
  });

  test('cloud-sync-ipc: _pickPushResult success keeps only newRevision/pushedAt', function() {
    var out = csIpc._pickPushResult({ ok: true, newRevision: 4, pushedAt: '2026-01-01T00:00:00Z',
      storagePath: 's', snapshotHash: 'h', leaseToken: 'l', deviceId: 'd' });
    assertEqual(out.ok, true);
    assertEqual(out.newRevision, 4);
    assert(typeof out.pushedAt === 'string');
    assert(!('storagePath' in out) && !('snapshotHash' in out) && !('leaseToken' in out) && !('deviceId' in out),
      'forbidden fields must be stripped');
  });

  test('cloud-sync-ipc: _pickPushResult stale keeps currentRevision (non-sensitive)', function() {
    var out = csIpc._pickPushResult({ ok: false, error: 'stale_revision', currentRevision: 9 });
    assertEqual(out.ok, false);
    assertEqual(out.error, 'stale_revision');
    assertEqual(out.currentRevision, 9);
  });

  test('cloud-sync-ipc: _STRIP_KEYS covers tokens/storage_path/checksum/lease_token/device id', function() {
    var k = csIpc._STRIP_KEYS;
    ['storage' + '_path', 'storagePath', 'checksum', 'lease' + '_token', 'leaseToken',
     'token', 'access' + '_token', 'deviceId', 'device' + '_id', 'rendererState'].forEach(function(key) {
      assert(k.indexOf(key) !== -1, 'must strip ' + key);
    });
  });

  test('cloud-sync-ipc: _sanitize removes forbidden keys', function() {
    var s = csIpc._sanitize({ ok: true, newRevision: 1, token: 'x', storage_path: 'p', checksum: 'c' });
    assert(s.ok === true && s.newRevision === 1);
    assert(!('token' in s) && !('storage_path' in s) && !('checksum' in s));
  });
}

// ── Async tests ────────────────────────────────────────────────────────────────
async function registerAsync(testAsync, assert, assertEqual) {
  console.log('\nCloud Sync — CAS push behavior (CLOUD-FOUNDATION-1G.2, async):');

  await testAsync('cloud-sync: owner push succeeds → ok + newRevision, only safe fields', async function() {
    var f = setup({ role: 'owner' });
    var r = await cs.pushWorkspaceSnapshot(baseInput());
    cs._resetForTests();
    assert(r.ok, 'must succeed');
    assertEqual(r.newRevision, 1);
    assert(typeof r.pushedAt === 'string', 'pushedAt must be a string');
    assert(!('storagePath' in r) && !('snapshotHash' in r) && !('leaseToken' in r) && !('deviceId' in r),
      'no forbidden fields in result');
    assertEqual(f._calls.acquire, 1, 'lock acquired once');
    assertEqual(f._calls.upload, 1, 'snapshot uploaded once');
    assertEqual(f._calls.push, 1, 'CAS push called once');
    assertEqual(f._calls.release, 1, 'lock released once');
  });

  await testAsync('cloud-sync: editor can push', async function() {
    setup({ role: 'editor' });
    var r = await cs.pushWorkspaceSnapshot(baseInput());
    cs._resetForTests();
    assert(r.ok, 'editor must be allowed to push');
  });

  await testAsync('cloud-sync: admin can push', async function() {
    setup({ role: 'admin' });
    var r = await cs.pushWorkspaceSnapshot(baseInput());
    cs._resetForTests();
    assert(r.ok, 'admin must be allowed to push');
  });

  await testAsync('cloud-sync: viewer CANNOT push — permission_denied before any lock/upload', async function() {
    var f = setup({ role: 'viewer' });
    var r = await cs.pushWorkspaceSnapshot(baseInput());
    cs._resetForTests();
    assert(!r.ok && r.error === 'permission_denied', 'viewer must be rejected');
    assertEqual(f._calls.acquire, 0, 'must not acquire a lock');
    assertEqual(f._calls.upload, 0, 'must not upload');
    assertEqual(f._calls.push, 0, 'must not push');
  });

  await testAsync('cloud-sync: CAS stale → non-destructive stale_revision + currentRevision', async function() {
    var f = setup({ role: 'owner', overrides: { stale: true } });
    var r = await cs.pushWorkspaceSnapshot(baseInput());
    cs._resetForTests();
    assert(!r.ok && r.error === 'stale_revision', 'stale must be surfaced');
    assertEqual(r.currentRevision, 7, 'must report server current revision');
    assertEqual(f._calls.push, 1, 'push attempted');
    assertEqual(f._calls.delete, 1, 'orphaned object cleaned up');
    assertEqual(f._calls.release, 1, 'lock released even on stale');
    assert(!('storagePath' in r), 'no storage path leaked on stale');
  });

  await testAsync('cloud-sync: locked → no upload, no push, returns locked', async function() {
    var f = setup({ role: 'owner', overrides: { locked: true } });
    var r = await cs.pushWorkspaceSnapshot(baseInput());
    cs._resetForTests();
    assert(!r.ok && r.error === 'locked', 'locked must be surfaced');
    assertEqual(f._calls.acquire, 1, 'acquire attempted');
    assertEqual(f._calls.upload, 0, 'must not upload when lock not held');
    assertEqual(f._calls.push, 0, 'must not push when lock not held');
  });

  await testAsync('cloud-sync: upload failure → upload_failed, no push, lock released', async function() {
    var f = setup({ role: 'owner', overrides: { uploadFail: true } });
    var r = await cs.pushWorkspaceSnapshot(baseInput());
    cs._resetForTests();
    assert(!r.ok && r.error === 'upload_failed', 'upload failure surfaced');
    assertEqual(f._calls.push, 0, 'must not push after a failed upload');
    assertEqual(f._calls.release, 1, 'lock released in finally');
  });

  await testAsync('cloud-sync: requires a valid base revision (non-negative integer)', async function() {
    var f = setup({ role: 'owner' });
    var r1 = await cs.pushWorkspaceSnapshot(baseInput({ baseRevision: -1 }));
    var r2 = await cs.pushWorkspaceSnapshot(baseInput({ baseRevision: 1.5 }));
    cs._resetForTests();
    assert(!r1.ok && r1.error === 'invalid_base_revision', 'negative rejected');
    assert(!r2.ok && r2.error === 'invalid_base_revision', 'non-integer rejected');
    assertEqual(f._calls.acquire, 0, 'no network for invalid base revision');
  });

  await testAsync('cloud-sync: invalid snapshot hash rejected before network', async function() {
    var f = setup({ role: 'owner' });
    var r = await cs.pushWorkspaceSnapshot(baseInput({ snapshotHash: 'not-a-sha256' }));
    cs._resetForTests();
    assert(!r.ok && r.error === 'invalid_snapshot_hash', 'bad hash rejected');
    assertEqual(f._calls.acquire, 0, 'no network for invalid hash');
  });

  await testAsync('cloud-sync: not authenticated → no network', async function() {
    var f = setup({ role: 'owner', authOk: false });
    var r = await cs.pushWorkspaceSnapshot(baseInput());
    cs._resetForTests();
    assert(!r.ok && r.error === 'not_authenticated', 'must require auth');
    assertEqual(f._calls.acquire, 0, 'no network when unauthenticated');
  });
}

module.exports = { register, registerAsync };
