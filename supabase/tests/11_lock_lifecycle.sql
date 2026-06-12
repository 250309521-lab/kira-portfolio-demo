-- Test 11: lock acquire / renew / release / force_unlock lifecycle.
-- Uses set_config/current_setting instead of DO blocks so ok() output is emitted.
BEGIN;
SELECT plan(12);

-- Alice acquires lock on ws1
SELECT set_config('request.jwt.claim.sub', '00000001-0000-0000-0000-000000000001', true);
SET LOCAL ROLE authenticated;

SELECT set_config('tests.r', ktp.acquire_lock('10000001-0000-0000-0000-000000000001', NULL, 60)::text, true);
SELECT ok((current_setting('tests.r')::jsonb->>'ok')::boolean = true,        'Alice acquires lock');
SELECT ok(current_setting('tests.r')::jsonb->>'lease_token' IS NOT NULL,     'lease_token returned');
SELECT set_config('tests.lease_token', current_setting('tests.r')::jsonb->>'lease_token', true);

-- Bob cannot acquire the same lock while Alice holds it
SELECT set_config('request.jwt.claim.sub', '00000001-0000-0000-0000-000000000002', true);

SELECT set_config('tests.r', ktp.acquire_lock('10000001-0000-0000-0000-000000000001', NULL, 60)::text, true);
SELECT ok((current_setting('tests.r')::jsonb->>'ok')::boolean = false,       'Bob cannot acquire lock held by Alice');
SELECT ok(current_setting('tests.r')::jsonb->>'error' = 'locked',            'Returns locked error');

-- Alice renews her lock
SELECT set_config('request.jwt.claim.sub', '00000001-0000-0000-0000-000000000001', true);

SELECT set_config('tests.r', ktp.renew_lock('10000001-0000-0000-0000-000000000001', current_setting('tests.lease_token'), 120)::text, true);
SELECT ok((current_setting('tests.r')::jsonb->>'ok')::boolean = true,        'Alice renews lock');
SELECT ok(current_setting('tests.r')::jsonb->>'expires_at' IS NOT NULL,      'renewed expires_at returned');

-- Wrong token on renew must fail
SELECT set_config('tests.r', ktp.renew_lock('10000001-0000-0000-0000-000000000001', 'wrongtoken', 60)::text, true);
SELECT ok((current_setting('tests.r')::jsonb->>'ok')::boolean = false,           'Wrong token renew fails');
SELECT ok(current_setting('tests.r')::jsonb->>'error' = 'invalid_lease_token',   'Returns invalid_lease_token');

-- Alice releases lock
SELECT set_config('tests.r', ktp.release_lock('10000001-0000-0000-0000-000000000001', current_setting('tests.lease_token'))::text, true);
SELECT ok((current_setting('tests.r')::jsonb->>'ok')::boolean = true,            'Alice releases lock');

-- Verify lock is now free (expires_at < now)
SET LOCAL ROLE postgres;
SELECT ok(
  (SELECT expires_at < now() FROM ktp.workspace_locks
   WHERE workspace_id = '10000001-0000-0000-0000-000000000001'),
  'Lock expires_at is in the past after release'
);

-- Bob acquires (lock is now free)
SELECT set_config('request.jwt.claim.sub', '00000001-0000-0000-0000-000000000002', true);
SET LOCAL ROLE authenticated;

SELECT set_config('tests.r', ktp.acquire_lock('10000001-0000-0000-0000-000000000001', NULL, 60)::text, true);
SELECT ok((current_setting('tests.r')::jsonb->>'ok')::boolean = true,        'Bob acquires lock after Alice released');

-- Alice (owner) force-unlocks while Bob holds it
SELECT set_config('request.jwt.claim.sub', '00000001-0000-0000-0000-000000000001', true);

SELECT set_config('tests.r', ktp.force_unlock('10000001-0000-0000-0000-000000000001')::text, true);
SELECT ok((current_setting('tests.r')::jsonb->>'ok')::boolean = true,        'Owner force_unlock succeeds');

SELECT * FROM finish();
ROLLBACK;
