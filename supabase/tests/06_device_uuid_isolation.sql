-- Test 06: device UUID isolation — machine fingerprints cannot be stored.
-- A 64-char hex machine fingerprint (sha256) must be rejected by the CHECK constraint.
BEGIN;
SELECT plan(4);

-- Valid UUID device IDs must be accepted
SELECT lives_ok(
  $$ INSERT INTO ktp.devices (id, user_id)
     VALUES (
       'deadbeef-0001-0002-0003-000000000001',
       '00000001-0000-0000-0000-000000000001'
     ) $$,
  'Valid UUID device ID is accepted'
);

-- 64-char lowercase hex (sha256 fingerprint shape) must be rejected
SELECT throws_ok(
  $$ INSERT INTO ktp.devices (id, user_id)
     VALUES (
       'a3f9b2c1d4e5f607a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1'::uuid,
       '00000001-0000-0000-0000-000000000001'
     ) $$,
  NULL,
  NULL,
  '64-char hex fingerprint cannot be cast to uuid'
);

-- A text value shaped like a 64-char hex must be rejected even if somehow cast
SELECT throws_ok(
  $$ INSERT INTO ktp.devices (id, user_id)
     VALUES (
       'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef'::uuid,
       '00000001-0000-0000-0000-000000000001'
     ) $$,
  NULL,
  NULL,
  '64-char hex without hyphens cannot be cast to uuid type'
);

-- Uppercase UUID must also pass (CHECK uses lowercase pattern)
SELECT lives_ok(
  $$ INSERT INTO ktp.devices (id, user_id)
     VALUES (
       gen_random_uuid(),
       '00000001-0000-0000-0000-000000000001'
     ) $$,
  'gen_random_uuid() device ID is accepted'
);

SELECT * FROM finish();
ROLLBACK;
