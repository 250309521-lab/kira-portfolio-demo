-- Test 07: client JWT direct writes are blocked on protected tables.
-- workspace_members, workspace_snapshots, workspace_locks, cloud_backups
-- must not accept direct INSERT from authenticated role.
BEGIN;
SELECT plan(5);

SELECT set_config('request.jwt.claim.sub', '00000001-0000-0000-0000-000000000001', true);
SET LOCAL ROLE authenticated;

-- Direct INSERT into workspace_members (must go through accept_invite RPC)
SELECT throws_ok(
  $$ INSERT INTO ktp.workspace_members (workspace_id, user_id, member_role, invited_by)
     VALUES (
       '10000001-0000-0000-0000-000000000002',
       '00000001-0000-0000-0000-000000000001',
       'admin',
       '00000001-0000-0000-0000-000000000001'
     ) $$,
  '42501',
  NULL,
  'Direct INSERT into workspace_members is blocked'
);

-- Direct INSERT into workspace_snapshots (must go through push RPC)
SELECT throws_ok(
  $$ INSERT INTO ktp.workspace_snapshots
     (workspace_id, pushed_by, revision, snapshot_hash, storage_path, byte_size)
     VALUES (
       '10000001-0000-0000-0000-000000000001',
       '00000001-0000-0000-0000-000000000001',
       1,
       'a3f9b2c1d4e5f607a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1',
       'workspaces/ws1/1_hash.ktpsnap',
       1024
     ) $$,
  '42501',
  NULL,
  'Direct INSERT into workspace_snapshots is blocked'
);

-- Direct UPDATE of workspace_locks (must go through acquire/renew/release RPCs)
SELECT throws_ok(
  $$ UPDATE ktp.workspace_locks SET expires_at = now() + interval '1 hour'
     WHERE workspace_id = '10000001-0000-0000-0000-000000000001' $$,
  '42501',
  NULL,
  'Direct UPDATE of workspace_locks is blocked'
);

-- Direct INSERT into cloud_backups (must go through create_cloud_backup_metadata RPC)
SELECT throws_ok(
  $$ INSERT INTO ktp.cloud_backups
     (workspace_id, created_by, backup_trigger, storage_path, byte_size, checksum)
     VALUES (
       '10000001-0000-0000-0000-000000000001',
       '00000001-0000-0000-0000-000000000001',
       'manual',
       'workspaces/ws1/backup.ktpbackup',
       1024,
       'a3f9b2c1d4e5f607a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1'
     ) $$,
  '42501',
  NULL,
  'Direct INSERT into cloud_backups is blocked'
);

-- Direct INSERT into invite_tokens (must go through create_invite_token RPC)
SELECT throws_ok(
  $$ INSERT INTO ktp.invite_tokens (workspace_id, token_role, created_by)
     VALUES (
       '10000001-0000-0000-0000-000000000001',
       'editor',
       '00000001-0000-0000-0000-000000000001'
     ) $$,
  '42501',
  NULL,
  'Direct INSERT into invite_tokens is blocked'
);

SELECT * FROM finish();
ROLLBACK;
