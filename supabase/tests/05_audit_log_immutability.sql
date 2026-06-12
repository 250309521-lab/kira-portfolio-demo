-- Test 05: audit_logs is immutable to client JWTs.
-- Direct INSERT/UPDATE/DELETE must fail even for workspace members.
BEGIN;
SELECT plan(3);

-- Seed a test audit entry as postgres (superuser, bypasses REVOKE)
SET LOCAL ROLE postgres;
INSERT INTO ktp.audit_logs (id, workspace_id, user_id, action)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  '10000001-0000-0000-0000-000000000001',
  '00000001-0000-0000-0000-000000000001',
  'test_event'
);

-- Switch to Alice (owner of ws1 — strongest possible client role)
SELECT set_config('request.jwt.claim.sub', '00000001-0000-0000-0000-000000000001', true);
SET LOCAL ROLE authenticated;

-- Direct INSERT must fail (REVOKE + no INSERT RLS policy)
SELECT throws_ok(
  $$ INSERT INTO ktp.audit_logs (workspace_id, user_id, action)
     VALUES (
       '10000001-0000-0000-0000-000000000001',
       '00000001-0000-0000-0000-000000000001',
       'injected_event'
     ) $$,
  '42501',
  'permission denied for table audit_logs',
  'Authenticated user cannot INSERT into audit_logs'
);

-- Direct UPDATE must fail
SELECT throws_ok(
  $$ UPDATE ktp.audit_logs SET action = 'tampered' WHERE id = 'a0000000-0000-0000-0000-000000000001' $$,
  '42501',
  'permission denied for table audit_logs',
  'Authenticated user cannot UPDATE audit_logs'
);

-- Direct DELETE must fail
SELECT throws_ok(
  $$ DELETE FROM ktp.audit_logs WHERE id = 'a0000000-0000-0000-0000-000000000001' $$,
  '42501',
  'permission denied for table audit_logs',
  'Authenticated user cannot DELETE from audit_logs'
);

SELECT * FROM finish();
ROLLBACK;
