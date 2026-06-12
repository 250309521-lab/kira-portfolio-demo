-- Test 04: role permission helper functions — is_workspace_member, has_min_role.
BEGIN;
SELECT plan(10);

-- Set up as Alice (owner of ws1)
SELECT set_config('request.jwt.claim.sub', '00000001-0000-0000-0000-000000000001', true);
SET LOCAL ROLE authenticated;

SELECT ok(
  ktp.is_workspace_member('10000001-0000-0000-0000-000000000001'),
  'Alice is_workspace_member ws1'
);

SELECT ok(
  NOT ktp.is_workspace_member('10000001-0000-0000-0000-000000000002'),
  'Alice is NOT member of ws2 (Carol''s)'
);

SELECT ok(
  ktp.has_min_role('10000001-0000-0000-0000-000000000001', ARRAY['owner']),
  'Alice has owner role in ws1'
);

SELECT ok(
  ktp.has_min_role('10000001-0000-0000-0000-000000000001', ARRAY['owner', 'admin']),
  'Alice satisfies [owner,admin] check in ws1'
);

SELECT ok(
  NOT ktp.has_min_role('10000001-0000-0000-0000-000000000001', ARRAY['admin', 'editor']),
  'Alice (owner) does not satisfy [admin,editor] role list'
);

-- Set up as Bob (editor in ws1)
SELECT set_config('request.jwt.claim.sub', '00000001-0000-0000-0000-000000000002', true);

SELECT ok(
  ktp.is_workspace_member('10000001-0000-0000-0000-000000000001'),
  'Bob is_workspace_member ws1'
);

SELECT ok(
  ktp.has_min_role('10000001-0000-0000-0000-000000000001', ARRAY['editor']),
  'Bob has editor role in ws1'
);

SELECT ok(
  NOT ktp.has_min_role('10000001-0000-0000-0000-000000000001', ARRAY['owner', 'admin']),
  'Bob (editor) does not satisfy [owner,admin] check'
);

-- Set up as Dave (no workspace)
SELECT set_config('request.jwt.claim.sub', '00000001-0000-0000-0000-000000000004', true);

SELECT ok(
  NOT ktp.is_workspace_member('10000001-0000-0000-0000-000000000001'),
  'Dave is not member of ws1'
);

SELECT ok(
  NOT ktp.has_min_role('10000001-0000-0000-0000-000000000001', ARRAY['viewer']),
  'Dave has no role in ws1'
);

SELECT * FROM finish();
ROLLBACK;
