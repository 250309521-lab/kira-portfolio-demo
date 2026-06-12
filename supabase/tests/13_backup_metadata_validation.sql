-- Test 13: create_cloud_backup_metadata input validation.
-- Uses set_config/current_setting instead of DO blocks so ok() output is emitted.
BEGIN;
SELECT plan(7);

SELECT set_config('request.jwt.claim.sub', '00000001-0000-0000-0000-000000000001', true);
SET LOCAL ROLE authenticated;

-- Valid backup metadata
SELECT set_config('tests.r', ktp.create_cloud_backup_metadata(
  '10000001-0000-0000-0000-000000000001',
  'workspaces/ws1/20260612_device1.ktpbackup',
  102400, 'a3f9b2c1d4e5f607a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1',
  'manual', '6.0.0', NULL, 1
)::text, true);
SELECT ok((current_setting('tests.r')::jsonb->>'ok')::boolean = true,     'Valid backup metadata accepted');
SELECT ok(current_setting('tests.r')::jsonb->>'backup_id' IS NOT NULL,    'backup_id returned');

-- Invalid checksum (not 64-char hex)
SELECT set_config('tests.r', ktp.create_cloud_backup_metadata(
  '10000001-0000-0000-0000-000000000001',
  'workspaces/ws1/bad.ktpbackup',
  1024, 'TOOSHORT', 'manual', '6.0.0', NULL, 1
)::text, true);
SELECT ok((current_setting('tests.r')::jsonb->>'ok')::boolean = false,    'Invalid checksum rejected');
SELECT ok(current_setting('tests.r')::jsonb->>'error' = 'invalid_checksum', 'Returns invalid_checksum');

-- Invalid backup_trigger value
SELECT set_config('tests.r', ktp.create_cloud_backup_metadata(
  '10000001-0000-0000-0000-000000000001',
  'workspaces/ws1/bad2.ktpbackup',
  1024, 'a3f9b2c1d4e5f607a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1',
  'scheduled', '6.0.0', NULL, 1
)::text, true);
SELECT ok((current_setting('tests.r')::jsonb->>'ok')::boolean = false,    'Invalid trigger rejected');
SELECT ok(current_setting('tests.r')::jsonb->>'error' = 'invalid_trigger', 'Returns invalid_trigger');

-- Non-member cannot create backup metadata (Dave has no access to ws1)
SELECT set_config('request.jwt.claim.sub', '00000001-0000-0000-0000-000000000004', true);

SELECT set_config('tests.r', ktp.create_cloud_backup_metadata(
  '10000001-0000-0000-0000-000000000001',
  'workspaces/ws1/dave.ktpbackup',
  1024, 'a3f9b2c1d4e5f607a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1',
  'manual', '6.0.0', NULL, 1
)::text, true);
SELECT ok((current_setting('tests.r')::jsonb->>'ok')::boolean = false,    'Non-member cannot create backup metadata');

SELECT * FROM finish();
ROLLBACK;
