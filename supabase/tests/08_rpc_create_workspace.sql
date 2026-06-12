-- Test 08: ktp.create_workspace RPC.
-- Uses set_config/current_setting instead of DO blocks so ok() output is emitted.
BEGIN;
SELECT plan(9);

-- As Dave (authenticated, has account but no workspace)
SELECT set_config('request.jwt.claim.sub', '00000001-0000-0000-0000-000000000004', true);
SET LOCAL ROLE authenticated;

-- Successful creation
SELECT set_config('tests.r', ktp.create_workspace('Dave Test Workspace', 'local-dave-ws-001')::text, true);
SELECT ok((current_setting('tests.r')::jsonb->>'ok')::boolean = true,         'create_workspace returns ok=true');
SELECT ok((current_setting('tests.r')::jsonb->>'workspace_id') IS NOT NULL,   'create_workspace returns workspace_id');
SELECT ok(
  (SELECT local_workspace_id FROM ktp.workspaces
   WHERE id = (current_setting('tests.r')::jsonb->>'workspace_id')::uuid) = 'local-dave-ws-001',
  'local_workspace_id is persisted in ktp.workspaces'
);

-- Verify Dave is now owner member
SELECT is(
  (SELECT member_role FROM ktp.workspace_members wm
   JOIN ktp.workspaces w ON w.id = wm.workspace_id
   WHERE w.owner_id = '00000001-0000-0000-0000-000000000004'
     AND wm.user_id = '00000001-0000-0000-0000-000000000004'),
  'owner',
  'Creator is automatically added as owner member'
);

-- Verify workspace_locks row was seeded by trigger
SELECT ok(
  EXISTS (
    SELECT 1 FROM ktp.workspace_locks wl
    JOIN ktp.workspaces w ON w.id = wl.workspace_id
    WHERE w.owner_id = '00000001-0000-0000-0000-000000000004'
  ),
  'workspace_locks row seeded by trigger on create'
);

-- Verify audit log entry was created
SET LOCAL ROLE postgres;
SELECT ok(
  EXISTS (
    SELECT 1 FROM ktp.audit_logs
    WHERE user_id = '00000001-0000-0000-0000-000000000004'
      AND action = 'workspace_created'
  ),
  'audit_logs entry created for workspace_created'
);

-- Empty name must fail
SELECT set_config('request.jwt.claim.sub', '00000001-0000-0000-0000-000000000005', true);
SET LOCAL ROLE authenticated;

SELECT set_config('tests.r', ktp.create_workspace('   ', 'local-blank-001')::text, true);
SELECT ok((current_setting('tests.r')::jsonb->>'ok')::boolean = false,        'create_workspace rejects blank name');
SELECT ok(current_setting('tests.r')::jsonb->>'error' = 'invalid_name',       'create_workspace returns invalid_name error');

-- Unauthenticated call (no sub set) must fail
SELECT set_config('request.jwt.claim.sub', '', true);

SELECT set_config('tests.r', ktp.create_workspace('Should Fail', 'local-fail-001')::text, true);
SELECT ok((current_setting('tests.r')::jsonb->>'ok')::boolean = false,        'create_workspace fails when not authenticated');

SELECT * FROM finish();
ROLLBACK;
