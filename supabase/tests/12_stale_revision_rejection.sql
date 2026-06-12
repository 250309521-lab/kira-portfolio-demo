-- Test 12: push_snapshot_with_revision_check CAS (stale revision rejection).
-- Uses set_config/current_setting instead of DO blocks so ok() output is emitted.
BEGIN;
SELECT plan(7);

-- Alice acquires lock
SELECT set_config('request.jwt.claim.sub', '00000001-0000-0000-0000-000000000001', true);
SET LOCAL ROLE authenticated;

SELECT set_config('tests.r', ktp.acquire_lock('10000001-0000-0000-0000-000000000001', NULL, 300)::text, true);
SELECT set_config('tests.lock_token_12', current_setting('tests.r')::jsonb->>'lease_token', true);

-- Push revision 1 with correct base_revision=0 → succeeds
SELECT set_config('tests.r',
  ktp.push_snapshot_with_revision_check(
    '10000001-0000-0000-0000-000000000001',
    current_setting('tests.lock_token_12'),
    0,
    'workspaces/ws1/1_hash.ktpsnap',
    'a3f9b2c1d4e5f607a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1',
    1024
  )::text,
  true
);
SELECT ok((current_setting('tests.r')::jsonb->>'ok')::boolean = true,            'Push with base_revision=0 succeeds');
SELECT ok((current_setting('tests.r')::jsonb->>'new_revision')::bigint = 1,      'New revision is 1');

-- Push again with stale base_revision=0 (server is now at 1) → fails
SELECT set_config('tests.r',
  ktp.push_snapshot_with_revision_check(
    '10000001-0000-0000-0000-000000000001',
    current_setting('tests.lock_token_12'),
    0,
    'workspaces/ws1/2_hash.ktpsnap',
    'a3f9b2c1d4e5f607a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1',
    1024
  )::text,
  true
);
SELECT ok((current_setting('tests.r')::jsonb->>'ok')::boolean = false,           'Stale revision push fails');
SELECT ok(current_setting('tests.r')::jsonb->>'error' = 'stale',                 'Returns stale error');
SELECT ok((current_setting('tests.r')::jsonb->>'current_revision')::bigint = 1,  'current_revision=1 returned');

-- Push with correct base_revision=1 → succeeds
SELECT set_config('tests.r',
  ktp.push_snapshot_with_revision_check(
    '10000001-0000-0000-0000-000000000001',
    current_setting('tests.lock_token_12'),
    1,
    'workspaces/ws1/2_hash.ktpsnap',
    'a3f9b2c1d4e5f607a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1',
    2048
  )::text,
  true
);
SELECT ok((current_setting('tests.r')::jsonb->>'ok')::boolean = true,            'Push with base_revision=1 succeeds');
SELECT ok((current_setting('tests.r')::jsonb->>'new_revision')::bigint = 2,      'New revision is 2');

SELECT * FROM finish();
ROLLBACK;
