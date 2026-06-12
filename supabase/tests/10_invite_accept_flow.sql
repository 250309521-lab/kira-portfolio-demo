-- Test 10: invite token creation and acceptance flow.
-- Uses set_config/current_setting instead of DO blocks so ok() output is emitted.
BEGIN;
SELECT plan(12);

-- Alice creates invite token for ws1
SELECT set_config('request.jwt.claim.sub', '00000001-0000-0000-0000-000000000001', true);
SET LOCAL ROLE authenticated;

SELECT set_config('tests.r', ktp.create_invite_token('10000001-0000-0000-0000-000000000001', 'editor', 1, 24)::text, true);
SELECT ok((current_setting('tests.r')::jsonb->>'ok')::boolean = true,    'Alice can create invite token');
SELECT ok(current_setting('tests.r')::jsonb->>'token' IS NOT NULL,       'token value returned');
SELECT ok(current_setting('tests.r')::jsonb->>'expires_at' IS NOT NULL,  'expires_at returned');
SELECT set_config('tests.invite_token', current_setting('tests.r')::jsonb->>'token', true);

-- Bob (editor) cannot create invite tokens (editor < admin)
SELECT set_config('request.jwt.claim.sub', '00000001-0000-0000-0000-000000000002', true);

SELECT set_config('tests.r', ktp.create_invite_token('10000001-0000-0000-0000-000000000001', 'viewer', 1, 24)::text, true);
SELECT ok((current_setting('tests.r')::jsonb->>'ok')::boolean = false,        'Editor cannot create invite token');
SELECT ok(current_setting('tests.r')::jsonb->>'error' = 'permission_denied',  'Returns permission_denied');

-- Dave accepts the invite
SELECT set_config('request.jwt.claim.sub', '00000001-0000-0000-0000-000000000004', true);

SELECT set_config('tests.r', ktp.accept_invite(current_setting('tests.invite_token'))::text, true);
SELECT ok((current_setting('tests.r')::jsonb->>'ok')::boolean = true,  'Dave can accept invite');
SELECT ok(current_setting('tests.r')::jsonb->>'role' = 'editor',       'Dave gets editor role');

-- Dave is now a member of ws1
SELECT is(
  (SELECT member_role FROM ktp.workspace_members
   WHERE workspace_id = '10000001-0000-0000-0000-000000000001'
     AND user_id = '00000001-0000-0000-0000-000000000004'),
  'editor',
  'Dave is now editor in ws1'
);

-- Accepting the same token again (max_uses=1; Dave is now already_member) must fail
SELECT set_config('tests.r', ktp.accept_invite(current_setting('tests.invite_token'))::text, true);
SELECT ok((current_setting('tests.r')::jsonb->>'ok')::boolean = false, 'Second accept fails (token exhausted or already member)');

-- Bogus token must fail with token_not_found
SELECT set_config('tests.r', ktp.accept_invite('notarealtoken123456789012345678901234567890123456789012345678901234')::text, true);
SELECT ok((current_setting('tests.r')::jsonb->>'ok')::boolean = false,       'Bogus token fails');
SELECT ok(current_setting('tests.r')::jsonb->>'error' = 'token_not_found',   'Returns token_not_found');

-- Verify audit log entry for invite_accepted
SET LOCAL ROLE postgres;
SELECT ok(
  EXISTS (
    SELECT 1 FROM ktp.audit_logs
    WHERE user_id = '00000001-0000-0000-0000-000000000004'
      AND action = 'invite_accepted'
  ),
  'audit_log entry for invite_accepted exists'
);

SELECT * FROM finish();
ROLLBACK;
