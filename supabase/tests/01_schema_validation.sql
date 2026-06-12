-- Test 01: schema validation — all tables exist with expected columns.
BEGIN;
SELECT plan(30);

-- Tables exist
SELECT has_table('ktp', 'accounts',            'ktp.accounts exists');
SELECT has_table('ktp', 'workspaces',           'ktp.workspaces exists');
SELECT has_table('ktp', 'workspace_members',    'ktp.workspace_members exists');
SELECT has_table('ktp', 'invite_tokens',        'ktp.invite_tokens exists');
SELECT has_table('ktp', 'devices',              'ktp.devices exists');
SELECT has_table('ktp', 'workspace_snapshots',  'ktp.workspace_snapshots exists');
SELECT has_table('ktp', 'workspace_locks',      'ktp.workspace_locks exists');
SELECT has_table('ktp', 'cloud_backups',        'ktp.cloud_backups exists');
SELECT has_table('ktp', 'audit_logs',           'ktp.audit_logs exists');

-- workspaces.local_workspace_id — maps Electron DATA.workspaceId to cloud workspace
SELECT has_column('ktp', 'workspaces', 'local_workspace_id', 'workspaces.local_workspace_id exists');
SELECT col_is_unique('ktp', 'workspaces', 'local_workspace_id', 'workspaces.local_workspace_id is unique');

-- workspace_members uses member_role (not role)
SELECT has_column('ktp', 'workspace_members', 'member_role', 'workspace_members.member_role column exists');
SELECT hasnt_column('ktp', 'workspace_members', 'role',      'workspace_members has no ambiguous role column');

-- invite_tokens uses token_role (not role)
SELECT has_column('ktp', 'invite_tokens', 'token_role', 'invite_tokens.token_role column exists');
SELECT hasnt_column('ktp', 'invite_tokens', 'role',     'invite_tokens has no ambiguous role column');

-- cloud_backups uses backup_trigger (not trigger)
SELECT has_column('ktp', 'cloud_backups', 'backup_trigger', 'cloud_backups.backup_trigger column exists');
SELECT hasnt_column('ktp', 'cloud_backups', 'trigger',      'cloud_backups has no reserved trigger column');

-- devices has UUID primary key (not text)
SELECT col_type_is('ktp', 'devices', 'id', 'uuid', 'devices.id is uuid type');

-- workspace_snapshots revision is bigint
SELECT col_type_is('ktp', 'workspace_snapshots', 'revision', 'bigint', 'workspace_snapshots.revision is bigint');

-- workspace_locks has acquired_at and expires_at
SELECT has_column('ktp', 'workspace_locks', 'acquired_at', 'workspace_locks.acquired_at exists');
SELECT has_column('ktp', 'workspace_locks', 'expires_at',  'workspace_locks.expires_at exists');
SELECT has_column('ktp', 'workspace_locks', 'lease_token', 'workspace_locks.lease_token exists');

-- audit_logs has action column
SELECT has_column('ktp', 'audit_logs', 'action', 'audit_logs.action exists');

-- Helper functions exist
SELECT has_function('ktp', 'is_workspace_member',  ARRAY['uuid'], 'ktp.is_workspace_member exists');
SELECT has_function('ktp', 'workspace_member_role', ARRAY['uuid'], 'ktp.workspace_member_role exists');
SELECT has_function('ktp', 'has_min_role',          ARRAY['uuid', 'text[]'], 'ktp.has_min_role exists');

-- RPC functions exist
SELECT has_function('ktp', 'create_workspace',                  ARRAY['text', 'text'],   'ktp.create_workspace exists');
SELECT has_function('ktp', 'register_device',                   ARRAY['uuid','text','text','text'], 'ktp.register_device exists');
SELECT has_function('ktp', 'push_snapshot_with_revision_check', ARRAY['uuid','text','bigint','text','text','bigint','uuid'], 'ktp.push_snapshot_with_revision_check exists');
SELECT has_function('ktp', 'acquire_lock',                      ARRAY['uuid','uuid','integer'], 'ktp.acquire_lock exists');

SELECT * FROM finish();
ROLLBACK;
