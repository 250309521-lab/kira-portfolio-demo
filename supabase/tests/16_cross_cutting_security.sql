-- Test 16: cross-cutting security invariants.
BEGIN;
SELECT plan(10);

-- 1. All ktp helper functions are SECURITY DEFINER
SELECT ok(
  (SELECT COUNT(*) FROM pg_proc p
   JOIN pg_namespace n ON p.pronamespace = n.oid
   WHERE n.nspname = 'ktp'
     AND p.proname IN ('is_workspace_member', 'workspace_member_role', 'has_min_role')
     AND p.prosecdef = true) = 3,
  'All 3 helper functions are SECURITY DEFINER'
);

-- 2. All ktp RPC functions are SECURITY DEFINER
SELECT ok(
  (SELECT COUNT(*) FROM pg_proc p
   JOIN pg_namespace n ON p.pronamespace = n.oid
   WHERE n.nspname = 'ktp'
     AND p.proname IN (
       'register_device', 'create_workspace', 'create_invite_token',
       'accept_invite', 'get_sync_status', 'acquire_lock', 'renew_lock',
       'release_lock', 'force_unlock', 'push_snapshot_with_revision_check',
       'get_latest_snapshot_metadata', 'create_cloud_backup_metadata',
       'create_backup_download_url'
     )
     AND p.prosecdef = true) = 13,
  'All 13 RPC functions are SECURITY DEFINER'
);

-- 3. No INSERT privilege on audit_logs for authenticated role
SELECT ok(
  NOT has_table_privilege('authenticated', 'ktp.audit_logs', 'INSERT'),
  'authenticated role has no INSERT on ktp.audit_logs'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'ktp.audit_logs', 'UPDATE'),
  'authenticated role has no UPDATE on ktp.audit_logs'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'ktp.audit_logs', 'DELETE'),
  'authenticated role has no DELETE on ktp.audit_logs'
);

-- 4. Unauthenticated (anon) cannot read any ktp table
SET LOCAL ROLE anon;

SELECT is(
  (SELECT COUNT(*)::integer FROM ktp.workspaces),
  0,
  'anon role sees no workspaces (default-deny RLS)'
);

SELECT is(
  (SELECT COUNT(*)::integer FROM ktp.accounts),
  0,
  'anon role sees no accounts (default-deny RLS)'
);

SET LOCAL ROLE postgres;

-- 5. ktp.devices UUID constraint name exists and is a check constraint
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_device_id_is_uuid' AND contype = 'c'
  ),
  'chk_device_id_is_uuid CHECK constraint exists'
);

-- 6. workspace_snapshots hash must be 64-char hex (CHECK constraint)
SELECT throws_ok(
  $$ INSERT INTO ktp.workspace_snapshots
     (workspace_id, pushed_by, revision, snapshot_hash, storage_path, byte_size)
     VALUES (
       '10000001-0000-0000-0000-000000000001',
       '00000001-0000-0000-0000-000000000001',
       999, 'NOTAHEX', 'workspaces/ws1/bad.ktpsnap', 1
     ) $$,
  '23514',
  NULL,
  'snapshot_hash CHECK constraint rejects non-hex value'
);

-- 7. cloud_backups checksum must be 64-char hex (CHECK constraint)
SELECT throws_ok(
  $$ INSERT INTO ktp.cloud_backups
     (workspace_id, created_by, backup_trigger, storage_path, byte_size, checksum)
     VALUES (
       '10000001-0000-0000-0000-000000000001',
       '00000001-0000-0000-0000-000000000001',
       'manual', 'workspaces/ws1/bad.ktpbackup', 1, 'BADCHECKSUM'
     ) $$,
  '23514',
  NULL,
  'cloud_backups checksum CHECK constraint rejects non-hex value'
);

SELECT * FROM finish();
ROLLBACK;
