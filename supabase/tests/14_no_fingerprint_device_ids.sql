-- Test 14: machine fingerprint-shaped IDs cannot be stored as device IDs.
-- A sha256 fingerprint is 64 lowercase hex chars with no hyphens.
-- The uuid type in PostgreSQL requires the 8-4-4-4-12 hyphenated format.
BEGIN;
SELECT plan(5);

-- Confirm the uuid type itself rejects 64-char hex strings
SELECT throws_ok(
  $$ SELECT 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef'::uuid $$,
  '22P02',
  NULL,
  '64-char hex without hyphens cannot be cast to uuid'
);

-- Confirm a machine fingerprint cannot be inserted via the RPC
SELECT set_config('request.jwt.claim.sub', '00000001-0000-0000-0000-000000000001', true);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$ SELECT ktp.register_device(
       'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef'::uuid,
       'Fingerprint Device', 'win32', '6.0.0'
     ) $$,
  NULL, NULL,
  'Machine fingerprint cannot be passed as device_id (type cast fails)'
);

-- Switch to superuser for direct INSERT constraint checks (bypasses RLS/grants).
-- These tests exercise type-system and CHECK constraints, not role permissions.
SET LOCAL ROLE postgres;

-- Confirm a hyphenated but invalid UUID with wrong segment lengths is rejected
SELECT throws_ok(
  $$ INSERT INTO ktp.devices (id, user_id) VALUES (
       '12345678-1234-1234-1234-12345678901234'::uuid,
       '00000001-0000-0000-0000-000000000001'
     ) $$,
  '22P02', NULL,
  'UUID with wrong segment lengths rejected by type system'
);

-- Valid UUID is accepted by both type and constraint
SELECT lives_ok(
  $$ INSERT INTO ktp.devices (id, user_id) VALUES (
       gen_random_uuid(),
       '00000001-0000-0000-0000-000000000001'
     ) $$,
  'gen_random_uuid() passes all constraints'
);

-- Confirm chk_device_id_is_uuid constraint exists on ktp.devices
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'ktp'
      AND t.relname = 'devices'
      AND c.conname = 'chk_device_id_is_uuid'
      AND c.contype = 'c'
  ),
  'chk_device_id_is_uuid CHECK constraint exists on ktp.devices'
);

SELECT * FROM finish();
ROLLBACK;
