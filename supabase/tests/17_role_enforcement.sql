-- Test 17: role enforcement — viewer is read-only for all mutation RPCs.
-- Eve  (00000001-0000-0000-0000-000000000005) is viewer  in Alice's ws1.
-- Bob  (00000001-0000-0000-0000-000000000002) is editor  in Alice's ws1.
-- Uses set_config/current_setting instead of DO blocks so ok() output is emitted.
BEGIN;
SELECT plan(10);

-- ── Eve (viewer) cannot acquire_lock ─────────────────────────────────────────
SELECT set_config('request.jwt.claim.sub', '00000001-0000-0000-0000-000000000005', true);
SET LOCAL ROLE authenticated;

SELECT set_config('tests.r', ktp.acquire_lock('10000001-0000-0000-0000-000000000001', NULL, 60)::text, true);
SELECT ok((current_setting('tests.r')::jsonb->>'ok')::boolean = false,                 'Viewer (Eve) cannot acquire_lock');
SELECT ok(current_setting('tests.r')::jsonb->>'error' = 'permission_denied',           'acquire_lock returns permission_denied for viewer');

-- ── Eve (viewer) cannot push_snapshot_with_revision_check ────────────────────
-- Role check fires before lease validation; dummy token is sufficient.
SELECT set_config('tests.r', ktp.push_snapshot_with_revision_check(
  '10000001-0000-0000-0000-000000000001',
  'dummy-token', 0,
  'workspaces/ws1/1_hash.ktpsnap',
  'a3f9b2c1d4e5f607a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1',
  1024
)::text, true);
SELECT ok((current_setting('tests.r')::jsonb->>'ok')::boolean = false,                 'Viewer (Eve) cannot push_snapshot_with_revision_check');
SELECT ok(current_setting('tests.r')::jsonb->>'error' = 'permission_denied',           'push_snapshot returns permission_denied for viewer');

-- ── Eve (viewer) cannot create_cloud_backup_metadata ─────────────────────────
SELECT set_config('tests.r', ktp.create_cloud_backup_metadata(
  '10000001-0000-0000-0000-000000000001',
  'workspaces/ws1/20260612_eve.ktpbackup',
  102400, 'a3f9b2c1d4e5f607a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1',
  'manual', '6.0.0', NULL, 1
)::text, true);
SELECT ok((current_setting('tests.r')::jsonb->>'ok')::boolean = false,                 'Viewer (Eve) cannot create_cloud_backup_metadata');
SELECT ok(current_setting('tests.r')::jsonb->>'error' = 'permission_denied',           'create_cloud_backup_metadata returns permission_denied for viewer');

-- ── Bob (editor) can acquire_lock ─────────────────────────────────────────────
SELECT set_config('request.jwt.claim.sub', '00000001-0000-0000-0000-000000000002', true);

SELECT set_config('tests.r', ktp.acquire_lock('10000001-0000-0000-0000-000000000001', NULL, 300)::text, true);
SELECT ok((current_setting('tests.r')::jsonb->>'ok')::boolean = true,                  'Editor (Bob) can acquire_lock');
SELECT set_config('tests.bob_token_17', current_setting('tests.r')::jsonb->>'lease_token', true);

-- ── Bob (editor) can push_snapshot when holding valid lock ────────────────────
SELECT set_config('tests.r', ktp.push_snapshot_with_revision_check(
  '10000001-0000-0000-0000-000000000001',
  current_setting('tests.bob_token_17'),
  0,
  'workspaces/ws1/1_hash.ktpsnap',
  'a3f9b2c1d4e5f607a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1',
  1024
)::text, true);
SELECT ok((current_setting('tests.r')::jsonb->>'ok')::boolean = true,                  'Editor (Bob) can push_snapshot when holding valid lock');
SELECT ok((current_setting('tests.r')::jsonb->>'new_revision')::bigint = 1,            'Editor (Bob) push returns new_revision=1');

-- ── Bob (editor) can create_cloud_backup_metadata ─────────────────────────────
SELECT set_config('tests.r', ktp.create_cloud_backup_metadata(
  '10000001-0000-0000-0000-000000000001',
  'workspaces/ws1/20260612_bob.ktpbackup',
  102400, 'a3f9b2c1d4e5f607a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1',
  'manual', '6.0.0', NULL, 1
)::text, true);
SELECT ok((current_setting('tests.r')::jsonb->>'ok')::boolean = true,                  'Editor (Bob) can create_cloud_backup_metadata');

SELECT * FROM finish();
ROLLBACK;
