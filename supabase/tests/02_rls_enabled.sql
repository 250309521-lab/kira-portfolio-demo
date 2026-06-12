-- Test 02: RLS is enabled and set to default-deny on all ktp tables.
BEGIN;
SELECT plan(9);

CREATE SCHEMA IF NOT EXISTS tests;

-- Helper: check relrowsecurity flag via pg_class
CREATE OR REPLACE FUNCTION tests.rls_enabled(schema_name text, table_name text)
RETURNS boolean AS $$
  SELECT relrowsecurity
  FROM pg_class c
  JOIN pg_namespace n ON c.relnamespace = n.oid
  WHERE n.nspname = schema_name AND c.relname = table_name;
$$ LANGUAGE sql;

SELECT ok(tests.rls_enabled('ktp', 'accounts'),           'RLS enabled on ktp.accounts');
SELECT ok(tests.rls_enabled('ktp', 'workspaces'),          'RLS enabled on ktp.workspaces');
SELECT ok(tests.rls_enabled('ktp', 'workspace_members'),   'RLS enabled on ktp.workspace_members');
SELECT ok(tests.rls_enabled('ktp', 'invite_tokens'),       'RLS enabled on ktp.invite_tokens');
SELECT ok(tests.rls_enabled('ktp', 'devices'),             'RLS enabled on ktp.devices');
SELECT ok(tests.rls_enabled('ktp', 'workspace_snapshots'), 'RLS enabled on ktp.workspace_snapshots');
SELECT ok(tests.rls_enabled('ktp', 'workspace_locks'),     'RLS enabled on ktp.workspace_locks');
SELECT ok(tests.rls_enabled('ktp', 'cloud_backups'),       'RLS enabled on ktp.cloud_backups');
SELECT ok(tests.rls_enabled('ktp', 'audit_logs'),          'RLS enabled on ktp.audit_logs');

SELECT * FROM finish();
ROLLBACK;
