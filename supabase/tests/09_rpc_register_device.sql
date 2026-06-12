-- Test 09: ktp.register_device RPC.
-- Uses set_config/current_setting instead of DO blocks so ok() output is emitted.
BEGIN;
SELECT plan(6);

SELECT set_config('request.jwt.claim.sub', '00000001-0000-0000-0000-000000000001', true);
SET LOCAL ROLE authenticated;

-- Valid UUID device registration
SELECT set_config('tests.r', ktp.register_device('cafecafe-0001-0002-0003-000000000001'::uuid, 'Alice Laptop', 'win32', '6.0.0')::text, true);
SELECT ok((current_setting('tests.r')::jsonb->>'ok')::boolean = true,                           'register_device returns ok=true');
SELECT ok(current_setting('tests.r')::jsonb->>'device_id' = 'cafecafe-0001-0002-0003-000000000001', 'register_device returns device_id');

-- Idempotent: re-registering same device updates last_seen_at
SELECT set_config('tests.r', ktp.register_device('cafecafe-0001-0002-0003-000000000001'::uuid, 'Alice Laptop v2', 'win32', '6.0.1')::text, true);
SELECT ok((current_setting('tests.r')::jsonb->>'ok')::boolean = true,                           'register_device is idempotent on conflict');

-- Verify device record exists with updated name
SET LOCAL ROLE postgres;
SELECT is(
  (SELECT device_name FROM ktp.devices WHERE id = 'cafecafe-0001-0002-0003-000000000001'::uuid),
  'Alice Laptop v2',
  'device_name updated on conflict'
);

-- Unauthenticated call must fail
SELECT set_config('request.jwt.claim.sub', '', true);
SET LOCAL ROLE authenticated;

SELECT set_config('tests.r', ktp.register_device(gen_random_uuid())::text, true);
SELECT ok((current_setting('tests.r')::jsonb->>'ok')::boolean = false,                          'register_device fails without auth');

-- A fingerprint-shaped text cannot be passed as uuid (type mismatch)
SELECT throws_ok(
  $$ SELECT ktp.register_device(
       'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef'::uuid
     ) $$,
  NULL, NULL,
  '64-char hex text cannot be cast to uuid for device registration'
);

SELECT * FROM finish();
ROLLBACK;
