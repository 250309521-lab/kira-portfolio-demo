'use strict';

// Ensure isConfigured() returns true for all tests.
if (!process.env.SUPABASE_URL)             process.env.SUPABASE_URL             = 'http://localhost:54321';
if (!process.env.SUPABASE_PUBLISHABLE_KEY) process.env.SUPABASE_PUBLISHABLE_KEY = 'test-anon-key';

const cb = require('../cloud/cloud-backup');

// ── Mock helpers ──────────────────────────────────────────────────────────────

function makeMockAuth(authenticated) {
  return {
    getSessionMeta: function() {
      return authenticated ? { ok: true, userId: 'u1' } : { ok: false };
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
}

module.exports = { register, registerAsync };
