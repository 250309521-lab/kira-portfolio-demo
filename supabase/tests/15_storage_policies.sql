-- Test 15: storage bucket policies — members can read; only editor+ can write.
BEGIN;
SELECT plan(8);

-- Verify buckets exist
SELECT ok(
  EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'ktp-snapshots'),
  'ktp-snapshots bucket exists'
);

SELECT ok(
  EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'ktp-backups'),
  'ktp-backups bucket exists'
);

-- Buckets must be private
SELECT ok(
  (SELECT NOT public FROM storage.buckets WHERE id = 'ktp-snapshots'),
  'ktp-snapshots bucket is private'
);

SELECT ok(
  (SELECT NOT public FROM storage.buckets WHERE id = 'ktp-backups'),
  'ktp-backups bucket is private'
);

-- RLS policies exist on storage.objects for both buckets
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname LIKE 'ktp-snapshots:%'
  ),
  'At least one ktp-snapshots policy exists on storage.objects'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname LIKE 'ktp-backups:%'
  ),
  'At least one ktp-backups policy exists on storage.objects'
);

-- INSERT policies must require editor+ role (viewer is read-only)
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'ktp-snapshots: editor insert'
      AND cmd        = 'INSERT'
      AND with_check LIKE '%has_min_role%'
  ),
  'ktp-snapshots INSERT policy requires editor+ role (has_min_role)'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'ktp-backups: editor insert'
      AND cmd        = 'INSERT'
      AND with_check LIKE '%has_min_role%'
  ),
  'ktp-backups INSERT policy requires editor+ role (has_min_role)'
);

SELECT * FROM finish();
ROLLBACK;
