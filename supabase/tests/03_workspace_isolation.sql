-- Test 03: workspace isolation — users cannot see workspaces they don't belong to.
-- Uses seed data: Alice owns ws1, Carol owns ws2, Dave has no workspace.
BEGIN;
SELECT plan(6);

-- As Alice: can see her own workspace, cannot see Carol's
SELECT set_config('request.jwt.claim.sub', '00000001-0000-0000-0000-000000000001', true);
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT COUNT(*)::integer FROM ktp.workspaces WHERE id = '10000001-0000-0000-0000-000000000001'),
  1, 'Alice can see her own workspace'
);

SELECT is(
  (SELECT COUNT(*)::integer FROM ktp.workspaces WHERE id = '10000001-0000-0000-0000-000000000002'),
  0, 'Alice cannot see Carol''s workspace'
);

-- As Bob: can see Alice's workspace (is editor), cannot see Carol's
SELECT set_config('request.jwt.claim.sub', '00000001-0000-0000-0000-000000000002', true);

SELECT is(
  (SELECT COUNT(*)::integer FROM ktp.workspaces WHERE id = '10000001-0000-0000-0000-000000000001'),
  1, 'Bob can see Alice''s workspace (he is editor)'
);

SELECT is(
  (SELECT COUNT(*)::integer FROM ktp.workspaces WHERE id = '10000001-0000-0000-0000-000000000002'),
  0, 'Bob cannot see Carol''s workspace'
);

-- As Dave: can see no workspaces
SELECT set_config('request.jwt.claim.sub', '00000001-0000-0000-0000-000000000004', true);

SELECT is(
  (SELECT COUNT(*)::integer FROM ktp.workspaces),
  0, 'Dave (no workspace) sees no workspaces'
);

-- As Carol: can see her workspace, not Alice's
SELECT set_config('request.jwt.claim.sub', '00000001-0000-0000-0000-000000000003', true);

SELECT is(
  (SELECT COUNT(*)::integer FROM ktp.workspaces),
  1, 'Carol sees exactly one workspace (her own)'
);

SELECT * FROM finish();
ROLLBACK;
