'use strict';

// Ensure isConfigured() returns true for all tests.
if (!process.env.SUPABASE_URL)             process.env.SUPABASE_URL             = 'http://localhost:54321';
if (!process.env.SUPABASE_PUBLISHABLE_KEY) process.env.SUPABASE_PUBLISHABLE_KEY = 'test-anon-key';

const cb     = require('../cloud/cloud-backup');
const config = require('../cloud/cloud-config');

// ── Mock helpers ──────────────────────────────────────────────────────────────

function makeMockAuth(authenticated) {
  return {
    getSessionMeta: function() {
      return authenticated ? { ok: true, userId: 'u1' } : { ok: false };
    },
    getAccessToken: async function() {
      return authenticated ? 'mock-jwt-token' : null;
    },
  };
}

// Mock workspace module. Tracks whether any write-capable method was called.
function makeMockWorkspace(opts) {
  opts = opts || {};
  var calls = { listWorkspaces: 0, createWorkspace: 0, activateWorkspace: 0 };
  return {
    _calls: calls,
    listWorkspaces: function() {
      calls.listWorkspaces++;
      if (opts.throws) return Promise.reject(new Error('net'));
      if (opts.listResult) return Promise.resolve(opts.listResult);
      return Promise.resolve({ ok: true, workspaces: opts.workspaces || [] });
    },
    createWorkspace:   function() { calls.createWorkspace++;   return Promise.resolve({ ok: true }); },
    activateWorkspace: function() { calls.activateWorkspace++; return Promise.resolve({ ok: true }); },
  };
}

var GOOD_CHECKSUM = 'a'.repeat(64);
var WS_ID = '11111111-1111-1111-1111-111111111111';

// ── Sync tests ────────────────────────────────────────────────────────────────

function register(test, assert, assertEqual) {

  console.log('\nCloud Backup — Validation & Pure Preflight (CLOUD-FOUNDATION-1F.4A):');

  test('cloud-backup: _validateWorkspaceId — valid', function() {
    assert(cb._validateWorkspaceId(WS_ID));
  });
  test('cloud-backup: _validateWorkspaceId — empty rejected', function() {
    assert(!cb._validateWorkspaceId(''));
  });
  test('cloud-backup: _validateWorkspaceId — whitespace rejected', function() {
    assert(!cb._validateWorkspaceId('   '));
  });
  test('cloud-backup: _validateWorkspaceId — non-string rejected', function() {
    assert(!cb._validateWorkspaceId(123));
  });

  test('cloud-backup: _safeStoragePath uses workspaces/{id}/ prefix and .ktpbackup', function() {
    var p = cb._safeStoragePath(WS_ID);
    assert(p.indexOf('workspaces/' + WS_ID + '/') === 0, 'path must be workspace-scoped');
    assert(/\.ktpbackup$/.test(p), 'path must end in .ktpbackup');
  });
  test('cloud-backup: _safeStoragePath never embeds a device id', function() {
    var p = cb._safeStoragePath(WS_ID);
    assert(!/device/i.test(p), 'storage path must not reference a device id');
  });

  test('cloud-backup: MAX_CLOUD_BACKUP_BYTES is 100MB', function() {
    assertEqual(cb.MAX_CLOUD_BACKUP_BYTES, 100 * 1024 * 1024);
  });
  test('cloud-backup: BACKUP_ROLES are owner/admin/editor only', function() {
    assertEqual(cb.BACKUP_ROLES.slice().sort().join(','), 'admin,editor,owner');
  });

  // derivePreflightMetadata — pure
  test('cloud-backup: derivePreflightMetadata — valid within-limit input', function() {
    var r = cb.derivePreflightMetadata({ workspaceId: WS_ID, byteSize: 2048, checksum: GOOD_CHECKSUM });
    assert(r.ok, 'must be ok');
    assertEqual(r.withinLimit, true);
    assertEqual(r.byteSize, 2048);
    assertEqual(r.checksumValid, true);
    assertEqual(r.metadataValid, true);
    assertEqual(r.trigger, 'manual');
    assertEqual(r.formatVersion, 1);
  });
  test('cloud-backup: derivePreflightMetadata — oversized → ok but withinLimit:false', function() {
    var r = cb.derivePreflightMetadata({ workspaceId: WS_ID, byteSize: cb.MAX_CLOUD_BACKUP_BYTES + 1, checksum: GOOD_CHECKSUM });
    assert(r.ok, 'oversized still runs preflight');
    assertEqual(r.withinLimit, false);
  });
  test('cloud-backup: derivePreflightMetadata — exactly at limit → withinLimit:true', function() {
    var r = cb.derivePreflightMetadata({ workspaceId: WS_ID, byteSize: cb.MAX_CLOUD_BACKUP_BYTES, checksum: GOOD_CHECKSUM });
    assertEqual(r.withinLimit, true);
  });
  test('cloud-backup: derivePreflightMetadata — invalid workspaceId', function() {
    var r = cb.derivePreflightMetadata({ workspaceId: '', byteSize: 100, checksum: GOOD_CHECKSUM });
    assert(!r.ok); assertEqual(r.error, 'invalid_input');
  });
  test('cloud-backup: derivePreflightMetadata — zero byteSize rejected', function() {
    var r = cb.derivePreflightMetadata({ workspaceId: WS_ID, byteSize: 0, checksum: GOOD_CHECKSUM });
    assert(!r.ok); assertEqual(r.error, 'invalid_byte_size');
  });
  test('cloud-backup: derivePreflightMetadata — negative byteSize rejected', function() {
    var r = cb.derivePreflightMetadata({ workspaceId: WS_ID, byteSize: -5, checksum: GOOD_CHECKSUM });
    assert(!r.ok); assertEqual(r.error, 'invalid_byte_size');
  });
  test('cloud-backup: derivePreflightMetadata — non-integer byteSize rejected', function() {
    var r = cb.derivePreflightMetadata({ workspaceId: WS_ID, byteSize: 12.5, checksum: GOOD_CHECKSUM });
    assert(!r.ok); assertEqual(r.error, 'invalid_byte_size');
  });
  test('cloud-backup: derivePreflightMetadata — bad checksum (too short) rejected', function() {
    var r = cb.derivePreflightMetadata({ workspaceId: WS_ID, byteSize: 100, checksum: 'abc' });
    assert(!r.ok); assertEqual(r.error, 'invalid_checksum');
  });
  test('cloud-backup: derivePreflightMetadata — bad checksum (uppercase) rejected', function() {
    var r = cb.derivePreflightMetadata({ workspaceId: WS_ID, byteSize: 100, checksum: 'A'.repeat(64) });
    assert(!r.ok); assertEqual(r.error, 'invalid_checksum');
  });
  test('cloud-backup: derivePreflightMetadata — invalid trigger rejected', function() {
    var r = cb.derivePreflightMetadata({ workspaceId: WS_ID, byteSize: 100, checksum: GOOD_CHECKSUM, trigger: 'evil' });
    assert(!r.ok); assertEqual(r.error, 'invalid_trigger');
  });
  test('cloud-backup: derivePreflightMetadata — metadata shape matches RPC params', function() {
    var r = cb.derivePreflightMetadata({ workspaceId: WS_ID, byteSize: 100, checksum: GOOD_CHECKSUM, appVersion: '6.0.0' });
    assert(r.metadata, 'metadata present');
    assertEqual(r.metadata.p_workspace_id, WS_ID);
    assertEqual(r.metadata.p_byte_size, 100);
    assertEqual(r.metadata.p_checksum, GOOD_CHECKSUM);
    assertEqual(r.metadata.p_backup_trigger, 'manual');
    assertEqual(r.metadata.p_format_version, 1);
    assertEqual(r.metadata.p_app_version, '6.0.0');
  });
  test('cloud-backup: derivePreflightMetadata — never returns a device id field', function() {
    var r = cb.derivePreflightMetadata({ workspaceId: WS_ID, byteSize: 100, checksum: GOOD_CHECKSUM });
    var json = JSON.stringify(r);
    assert(!/device/i.test(json), 'preflight output must not contain any device reference');
  });
}

// ── Async tests ───────────────────────────────────────────────────────────────

async function registerAsync(testAsync, assert, assertEqual) {

  await testAsync('cloud-backup: getCloudBackupReadiness — owner can back up', async function() {
    cb._setAuth(makeMockAuth(true));
    cb._setWorkspace(makeMockWorkspace({ workspaces: [{ workspaceId: WS_ID, memberRole: 'owner' }] }));
    var r = await cb.getCloudBackupReadiness(WS_ID);
    cb._resetForTests();
    assert(r.ok, 'must be ok');
    assertEqual(r.role, 'owner');
    assertEqual(r.canBackup, true);
    assertEqual(r.maxBytes, cb.MAX_CLOUD_BACKUP_BYTES);
  });

  await testAsync('cloud-backup: getCloudBackupReadiness — editor can back up', async function() {
    cb._setAuth(makeMockAuth(true));
    cb._setWorkspace(makeMockWorkspace({ workspaces: [{ workspaceId: WS_ID, memberRole: 'editor' }] }));
    var r = await cb.getCloudBackupReadiness(WS_ID);
    cb._resetForTests();
    assert(r.ok); assertEqual(r.canBackup, true);
  });

  await testAsync('cloud-backup: getCloudBackupReadiness — viewer cannot back up (canBackup:false)', async function() {
    cb._setAuth(makeMockAuth(true));
    cb._setWorkspace(makeMockWorkspace({ workspaces: [{ workspaceId: WS_ID, memberRole: 'viewer' }] }));
    var r = await cb.getCloudBackupReadiness(WS_ID);
    cb._resetForTests();
    assert(r.ok); assertEqual(r.role, 'viewer'); assertEqual(r.canBackup, false);
  });

  await testAsync('cloud-backup: getCloudBackupReadiness — not authenticated', async function() {
    cb._setAuth(makeMockAuth(false));
    cb._setWorkspace(makeMockWorkspace({ workspaces: [] }));
    var r = await cb.getCloudBackupReadiness(WS_ID);
    cb._resetForTests();
    assert(!r.ok); assertEqual(r.error, 'not_authenticated');
  });

  await testAsync('cloud-backup: getCloudBackupReadiness — invalid workspaceId', async function() {
    cb._setAuth(makeMockAuth(true));
    var r = await cb.getCloudBackupReadiness('');
    cb._resetForTests();
    assert(!r.ok); assertEqual(r.error, 'invalid_input');
  });

  await testAsync('cloud-backup: getCloudBackupReadiness — workspace not found', async function() {
    cb._setAuth(makeMockAuth(true));
    cb._setWorkspace(makeMockWorkspace({ workspaces: [{ workspaceId: 'other', memberRole: 'owner' }] }));
    var r = await cb.getCloudBackupReadiness(WS_ID);
    cb._resetForTests();
    assert(!r.ok); assertEqual(r.error, 'workspace_not_found');
  });

  await testAsync('cloud-backup: getCloudBackupReadiness — listWorkspaces throws → network_error', async function() {
    cb._setAuth(makeMockAuth(true));
    cb._setWorkspace(makeMockWorkspace({ throws: true }));
    var r = await cb.getCloudBackupReadiness(WS_ID);
    cb._resetForTests();
    assert(!r.ok); assertEqual(r.error, 'network_error');
  });

  await testAsync('cloud-backup: getCloudBackupReadiness — propagates listWorkspaces error', async function() {
    cb._setAuth(makeMockAuth(true));
    cb._setWorkspace(makeMockWorkspace({ listResult: { ok: false, error: 'permission_denied' } }));
    var r = await cb.getCloudBackupReadiness(WS_ID);
    cb._resetForTests();
    assert(!r.ok); assertEqual(r.error, 'permission_denied');
  });

  await testAsync('cloud-backup: getCloudBackupReadiness — never returns device id / tokens', async function() {
    cb._setAuth(makeMockAuth(true));
    cb._setWorkspace(makeMockWorkspace({ workspaces: [{ workspaceId: WS_ID, memberRole: 'owner' }] }));
    var r = await cb.getCloudBackupReadiness(WS_ID);
    cb._resetForTests();
    var json = JSON.stringify(r);
    assert(!/device/i.test(json), 'no device reference');
    assert(!/token/i.test(json),  'no token reference');
  });

  await testAsync('cloud-backup: getCloudBackupReadiness — only reads (never calls write-capable workspace methods)', async function() {
    cb._setAuth(makeMockAuth(true));
    var mockWs = makeMockWorkspace({ workspaces: [{ workspaceId: WS_ID, memberRole: 'owner' }] });
    cb._setWorkspace(mockWs);
    await cb.getCloudBackupReadiness(WS_ID);
    cb._resetForTests();
    assert(mockWs._calls.listWorkspaces === 1, 'listWorkspaces called once');
    assertEqual(mockWs._calls.createWorkspace, 0);
    assertEqual(mockWs._calls.activateWorkspace, 0);
  });

  // ── createManualCloudBackup (CLOUD-FOUNDATION-1F.4B) ─────────────────────────

  console.log('\nCloud Backup — Manual Upload (CLOUD-FOUNDATION-1F.4B):');

  var GOOD_ARCHIVE = JSON.stringify({ manifest: { formatVersion: 1 }, data: 'test' });

  function makeFetch(overrides) {
    var _calls = { upload: 0, rpc: 0, delete: 0 };
    var fn = async function(url, opts) {
      if (url.includes('/storage/v1/object/')) {
        if (opts.method === 'DELETE') {
          _calls.delete++;
          return { ok: (overrides && overrides.deleteOk === false) ? false : true };
        }
        _calls.upload++;
        var uploadOk = !(overrides && overrides.uploadFail);
        return { ok: uploadOk };
      }
      if (url.includes('/rest/v1/rpc/create_cloud_backup_metadata')) {
        _calls.rpc++;
        var rpcOk = !(overrides && overrides.rpcFail);
        return {
          ok: rpcOk,
          json: async function() {
            return rpcOk ? { ok: true, backup_id: 'bkp-uuid-001' } : { ok: false, error: 'permission_denied' };
          },
        };
      }
      return { ok: true, json: async function() { return { ok: true }; } };
    };
    fn._calls = _calls;
    return fn;
  }

  function setupManual(opts) {
    opts = opts || {};
    cb._setAuth(makeMockAuth(opts.authOk !== false));
    var wsOpts = opts.wsOpts || { workspaces: [{ workspaceId: WS_ID, memberRole: opts.role || 'owner' }] };
    cb._setWorkspace(makeMockWorkspace(wsOpts));
    var fetch = opts.fetch || makeFetch();
    cb._setFetch(fetch);
    return fetch;
  }

  await testAsync('cloud-backup: createManualCloudBackup — success returns sanitized result', async function() {
    var f = setupManual();
    var r = await cb.createManualCloudBackup({ workspaceId: WS_ID, archiveStr: GOOD_ARCHIVE, byteSize: 200, checksum: GOOD_CHECKSUM });
    cb._resetForTests();
    assert(r.ok, 'must be ok');
    assertEqual(r.backupId, 'bkp-uuid-001');
    assert(typeof r.createdAt === 'string', 'createdAt must be a string');
    assertEqual(r.byteSize, 200);
    assertEqual(r.trigger, 'manual');
    assert(!('storagePath' in r), 'storagePath must not be returned');
    assert(!('checksum'    in r), 'checksum must not be returned');
    assert(!('deviceId'    in r), 'deviceId must not be returned');
    assertEqual(f._calls.upload, 1, 'upload must be called once');
    assertEqual(f._calls.rpc,    1, 'metadata RPC must be called once');
    assertEqual(f._calls.delete, 0, 'delete must not be called on success');
  });

  await testAsync('cloud-backup: createManualCloudBackup — upload failure → upload_failed, no RPC called', async function() {
    var f = setupManual({ fetch: makeFetch({ uploadFail: true }) });
    var r = await cb.createManualCloudBackup({ workspaceId: WS_ID, archiveStr: GOOD_ARCHIVE, byteSize: 200, checksum: GOOD_CHECKSUM });
    cb._resetForTests();
    assert(!r.ok); assertEqual(r.error, 'upload_failed');
    assertEqual(f._calls.rpc,    0, 'RPC must not be called when upload fails');
    assertEqual(f._calls.delete, 0, 'cleanup must not be called when upload fails');
  });

  await testAsync('cloud-backup: createManualCloudBackup — metadata failure + successful cleanup → metadata_failed', async function() {
    var f = setupManual({ fetch: makeFetch({ rpcFail: true }) });
    var r = await cb.createManualCloudBackup({ workspaceId: WS_ID, archiveStr: GOOD_ARCHIVE, byteSize: 200, checksum: GOOD_CHECKSUM });
    cb._resetForTests();
    assert(!r.ok); assertEqual(r.error, 'metadata_failed');
    assertEqual(f._calls.upload, 1, 'upload must have been called');
    assertEqual(f._calls.rpc,    1, 'RPC must have been attempted');
    assertEqual(f._calls.delete, 1, 'cleanup delete must have been attempted');
  });

  await testAsync('cloud-backup: createManualCloudBackup — metadata failure + cleanup failure → cleanup_failed', async function() {
    var f = setupManual({ fetch: makeFetch({ rpcFail: true, deleteOk: false }) });
    var r = await cb.createManualCloudBackup({ workspaceId: WS_ID, archiveStr: GOOD_ARCHIVE, byteSize: 200, checksum: GOOD_CHECKSUM });
    cb._resetForTests();
    assert(!r.ok); assertEqual(r.error, 'cleanup_failed');
    assertEqual(f._calls.delete, 1, 'cleanup must have been attempted');
  });

  await testAsync('cloud-backup: createManualCloudBackup — viewer → permission_denied before upload', async function() {
    var f = setupManual({ role: 'viewer' });
    var r = await cb.createManualCloudBackup({ workspaceId: WS_ID, archiveStr: GOOD_ARCHIVE, byteSize: 200, checksum: GOOD_CHECKSUM });
    cb._resetForTests();
    assert(!r.ok); assertEqual(r.error, 'permission_denied');
    assertEqual(f._calls.upload, 0, 'upload must not be called for viewer');
  });

  await testAsync('cloud-backup: createManualCloudBackup — not authenticated → no upload', async function() {
    var f = setupManual({ authOk: false });
    var r = await cb.createManualCloudBackup({ workspaceId: WS_ID, archiveStr: GOOD_ARCHIVE, byteSize: 200, checksum: GOOD_CHECKSUM });
    cb._resetForTests();
    assert(!r.ok); assertEqual(r.error, 'not_authenticated');
    assertEqual(f._calls.upload, 0);
  });

  await testAsync('cloud-backup: createManualCloudBackup — workspace not found → no_active_workspace', async function() {
    setupManual({ wsOpts: { workspaces: [{ workspaceId: 'other', memberRole: 'owner' }] } });
    var r = await cb.createManualCloudBackup({ workspaceId: WS_ID, archiveStr: GOOD_ARCHIVE, byteSize: 200, checksum: GOOD_CHECKSUM });
    cb._resetForTests();
    assert(!r.ok); assertEqual(r.error, 'no_active_workspace');
  });

  await testAsync('cloud-backup: createManualCloudBackup — oversized archive → backup_too_large, no upload', async function() {
    var f = setupManual();
    var r = await cb.createManualCloudBackup({ workspaceId: WS_ID, archiveStr: GOOD_ARCHIVE, byteSize: cb.MAX_CLOUD_BACKUP_BYTES + 1, checksum: GOOD_CHECKSUM });
    cb._resetForTests();
    assert(!r.ok); assertEqual(r.error, 'backup_too_large');
    assertEqual(f._calls.upload, 0);
  });

  await testAsync('cloud-backup: createManualCloudBackup — bad checksum → checksum_failed, no upload', async function() {
    var f = setupManual();
    var r = await cb.createManualCloudBackup({ workspaceId: WS_ID, archiveStr: GOOD_ARCHIVE, byteSize: 200, checksum: 'tooshort' });
    cb._resetForTests();
    assert(!r.ok); assertEqual(r.error, 'checksum_failed');
    assertEqual(f._calls.upload, 0);
  });

  await testAsync('cloud-backup: createManualCloudBackup — missing archiveStr → backup_build_failed, no upload', async function() {
    var f = setupManual();
    var r = await cb.createManualCloudBackup({ workspaceId: WS_ID, archiveStr: '', byteSize: 200, checksum: GOOD_CHECKSUM });
    cb._resetForTests();
    assert(!r.ok); assertEqual(r.error, 'backup_build_failed');
    assertEqual(f._calls.upload, 0);
  });

  await testAsync('cloud-backup: createManualCloudBackup — never returns storagePath/checksum/deviceId', async function() {
    setupManual();
    var r = await cb.createManualCloudBackup({ workspaceId: WS_ID, archiveStr: GOOD_ARCHIVE, byteSize: 200, checksum: GOOD_CHECKSUM });
    cb._resetForTests();
    var json = JSON.stringify(r);
    assert(!/storage[Pp]ath/i.test(json), 'storagePath must not appear in result');
    assert(!/checksum/i.test(json),        'raw checksum must not appear in result');
    assert(!/device/i.test(json),          'device id must not appear in result');
    assert(!/token/i.test(json),           'token must not appear in result');
  });

  await testAsync('cloud-backup: createManualCloudBackup — upload uses Content-Type: application/octet-stream (bucket MIME requirement)', async function() {
    var capturedUploadHeaders = null;
    var headerCaptureFetch = async function(url, opts) {
      if (url.includes('/storage/v1/object/') && opts.method !== 'DELETE') {
        capturedUploadHeaders = opts.headers;
        return { ok: true };
      }
      return { ok: true, json: async function() { return { ok: true, backup_id: 'bkp-x' }; } };
    };
    cb._setAuth(makeMockAuth(true));
    cb._setWorkspace(makeMockWorkspace({ workspaces: [{ workspaceId: WS_ID, memberRole: 'owner' }] }));
    cb._setFetch(headerCaptureFetch);
    await cb.createManualCloudBackup({ workspaceId: WS_ID, archiveStr: GOOD_ARCHIVE, byteSize: 200, checksum: GOOD_CHECKSUM });
    cb._resetForTests();
    assert(capturedUploadHeaders !== null, 'upload must have been called');
    assertEqual(capturedUploadHeaders['Content-Type'], 'application/octet-stream',
      'upload Content-Type must be application/octet-stream to satisfy bucket MIME restriction');
  });

  await testAsync('cloud-backup: createManualCloudBackup — never calls create_backup_download_url or push_snapshot', async function() {
    var forbidden = ['create_backup_download_url', 'push_snapshot_with_revision_check'];
    var seenUrls = [];
    var fetch = makeFetch();
    var origFetch = fetch;
    var wrappedFetch = async function(url, opts) {
      seenUrls.push(url);
      return origFetch(url, opts);
    };
    wrappedFetch._calls = fetch._calls;
    cb._setAuth(makeMockAuth(true));
    cb._setWorkspace(makeMockWorkspace({ workspaces: [{ workspaceId: WS_ID, memberRole: 'owner' }] }));
    cb._setFetch(wrappedFetch);
    await cb.createManualCloudBackup({ workspaceId: WS_ID, archiveStr: GOOD_ARCHIVE, byteSize: 200, checksum: GOOD_CHECKSUM });
    cb._resetForTests();
    forbidden.forEach(function(name) {
      assert(!seenUrls.some(function(u) { return u.includes(name); }),
        'must never call: ' + name);
    });
  });

  // ── listCloudBackups (CLOUD-FOUNDATION-1F.4C) ─────────────────────────────

  await testAsync('cloud-backup: listCloudBackups — success returns stripped backup rows', async function() {
    cb._setAuth(makeMockAuth(true));
    cb._setFetch(function() {
      return Promise.resolve({
        ok: true, status: 200,
        json: function() {
          return Promise.resolve([
            { id: 'b-1', backup_trigger: 'manual', byte_size: 490102,
              app_version: '6.0.0', format_version: 1, created_at: '2026-06-17T22:53:24Z',
              storage_path: 'workspaces/ws-1/secret.ktpbackup',
              checksum: 'a'.repeat(64), device_id: 'dev-1' },
          ]);
        },
      });
    });
    var r = await cb.listCloudBackups(WS_ID);
    cb._resetForTests();
    assert(r.ok, 'must return ok');
    assertEqual(r.backups.length, 1, 'must have one backup');
    var b = r.backups[0];
    assertEqual(b.backupId,      'b-1');
    assertEqual(b.trigger,       'manual');
    assertEqual(b.byteSize,      490102);
    assertEqual(b.appVersion,    '6.0.0');
    assertEqual(b.formatVersion, 1);
    assertEqual(b.createdAt,     '2026-06-17T22:53:24Z');
    assert(!('storage_path' in b), 'storage_path must be stripped');
    assert(!('checksum'     in b), 'checksum must be stripped');
    assert(!('device_id'    in b), 'device_id must be stripped');
    assert(!('storagePath'  in b), 'storagePath must be stripped');
  });

  await testAsync('cloud-backup: listCloudBackups — not_configured when config absent', async function() {
    config._setConfigForTests('', '');
    try {
      var r = await cb.listCloudBackups(WS_ID);
      assertEqual(r.error, 'not_configured');
    } finally { config._resetConfigForTests(); cb._resetForTests(); }
  });

  await testAsync('cloud-backup: listCloudBackups — not_authenticated when no token', async function() {
    cb._setAuth(makeMockAuth(false));
    var r = await cb.listCloudBackups(WS_ID);
    cb._resetForTests();
    assertEqual(r.error, 'not_authenticated');
  });

  await testAsync('cloud-backup: listCloudBackups — network_error on fetch throw', async function() {
    cb._setAuth(makeMockAuth(true));
    cb._setFetch(function() { return Promise.reject(new Error('net')); });
    var r = await cb.listCloudBackups(WS_ID);
    cb._resetForTests();
    assertEqual(r.error, 'network_error');
  });

  await testAsync('cloud-backup: listCloudBackups — returns empty array when no backups', async function() {
    cb._setAuth(makeMockAuth(true));
    cb._setFetch(function() {
      return Promise.resolve({ ok: true, json: function() { return Promise.resolve([]); } });
    });
    var r = await cb.listCloudBackups(WS_ID);
    cb._resetForTests();
    assert(r.ok, 'must return ok');
    assertEqual(r.backups.length, 0, 'must return empty array');
  });

  await testAsync('cloud-backup: listCloudBackups — sends Accept-Profile: ktp header', async function() {
    var capturedHeaders = null;
    cb._setAuth(makeMockAuth(true));
    cb._setFetch(function(_url, opts) {
      capturedHeaders = opts ? opts.headers : null;
      return Promise.resolve({ ok: true, json: function() { return Promise.resolve([]); } });
    });
    await cb.listCloudBackups(WS_ID);
    cb._resetForTests();
    assert(capturedHeaders !== null, 'headers must be captured');
    assertEqual(capturedHeaders['Accept-Profile'], 'ktp', 'must send Accept-Profile: ktp');
  });

  // ── getBackupDownloadPreflight (CLOUD-FOUNDATION-1F.4C) ──────────────────

  // Helper: makes a mock fetch that uses text() (matching the defensive res.text() path).
  function makePfFetch(payload, httpOk) {
    var body = JSON.stringify(payload);
    return function() {
      return Promise.resolve({
        ok: httpOk !== false,
        status: httpOk !== false ? 200 : 400,
        text: function() { return Promise.resolve(body); },
      });
    };
  }

  await testAsync('cloud-backup: getBackupDownloadPreflight — success strips storage_path and checksum', async function() {
    cb._setAuth(makeMockAuth(true));
    cb._setFetch(makePfFetch({ ok: true, bucket: 'ktp-backups',
      storage_path: 'workspaces/ws-1/secret.ktpbackup',
      checksum: 'a'.repeat(64), byte_size: 490102 }));
    var r = await cb.getBackupDownloadPreflight(WS_ID, 'b-uuid-1');
    cb._resetForTests();
    assert(r.ok, 'must return ok');
    assertEqual(r.backupId, 'b-uuid-1');
    assertEqual(r.byteSize, 490102);
    assert(!('storage_path' in r), 'storage_path must never be returned');
    assert(!('storagePath'  in r), 'storagePath must never be returned');
    assert(!('checksum'     in r), 'checksum must never be returned');
    assert(!('bucket'       in r), 'bucket must not be returned');
  });

  await testAsync('cloud-backup: getBackupDownloadPreflight — backup_not_found maps correctly', async function() {
    cb._setAuth(makeMockAuth(true));
    cb._setFetch(makePfFetch({ ok: false, error: 'backup_not_found' }, false));
    var r = await cb.getBackupDownloadPreflight(WS_ID, 'b-missing');
    cb._resetForTests();
    assertEqual(r.error, 'backup_not_found');
  });

  await testAsync('cloud-backup: getBackupDownloadPreflight — not_authenticated when no token', async function() {
    cb._setAuth(makeMockAuth(false));
    var r = await cb.getBackupDownloadPreflight(WS_ID, 'b-uuid-1');
    cb._resetForTests();
    assertEqual(r.error, 'not_authenticated');
  });

  await testAsync('cloud-backup: getBackupDownloadPreflight — never exposes dangerous fields', async function() {
    cb._setAuth(makeMockAuth(true));
    cb._setFetch(makePfFetch({ ok: true, bucket: 'ktp-backups',
      storage_path: 'workspaces/x/f.ktpbackup',
      checksum: 'a'.repeat(64), byte_size: 100 }));
    var r = await cb.getBackupDownloadPreflight(WS_ID, 'b-uuid-1');
    cb._resetForTests();
    ['storage_path','storagePath','checksum','device_id','deviceId',
     'access_token','refresh_token','service_role','archiveStr'].forEach(function(k) {
      assert(!(k in r), 'preflight must not expose: ' + k);
    });
  });

  await testAsync('cloud-backup: getBackupDownloadPreflight — empty response body maps to download_preflight_failed', async function() {
    cb._setAuth(makeMockAuth(true));
    cb._setFetch(function() {
      return Promise.resolve({
        ok: true, status: 204,
        text: function() { return Promise.resolve(''); },
      });
    });
    var r = await cb.getBackupDownloadPreflight(WS_ID, 'b-uuid-1');
    cb._resetForTests();
    assert(!r.ok, 'must return ok:false for empty body');
    assertEqual(r.error, 'download_preflight_failed', 'empty body → download_preflight_failed');
  });

  await testAsync('cloud-backup: getBackupDownloadPreflight — malformed JSON maps to download_preflight_failed', async function() {
    cb._setAuth(makeMockAuth(true));
    cb._setFetch(function() {
      return Promise.resolve({
        ok: true, status: 200,
        text: function() { return Promise.resolve('{not valid json'); },
      });
    });
    var r = await cb.getBackupDownloadPreflight(WS_ID, 'b-uuid-1');
    cb._resetForTests();
    assert(!r.ok, 'must return ok:false for malformed JSON');
    assertEqual(r.error, 'download_preflight_failed', 'malformed JSON → download_preflight_failed');
  });
}

module.exports = { register, registerAsync };
