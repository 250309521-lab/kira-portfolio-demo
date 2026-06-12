-- Migration 10: storage bucket creation and RLS policies.
-- Buckets are also declared in config.toml for local dev; this migration makes
-- them explicit in the DB so they exist after supabase db push to remote.
--
-- Storage path conventions (enforced by naming in RPCs, not by DB constraint):
--   ktp-snapshots: workspaces/{workspace_id}/{revision}_{hash}.ktpsnap
--   ktp-backups:   workspaces/{workspace_id}/{timestamp}_{device_id}.ktpbackup

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('ktp-snapshots', 'ktp-snapshots', false, 104857600, ARRAY['application/octet-stream']),
  ('ktp-backups',   'ktp-backups',   false, 104857600, ARRAY['application/octet-stream'])
ON CONFLICT (id) DO NOTHING;

-- ─── ktp-snapshots policies ───────────────────────────────────────────────────

CREATE POLICY "ktp-snapshots: member select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'ktp-snapshots'
    AND (regexp_match(name, '^workspaces/([^/]+)/'))[1] IS NOT NULL
    AND ktp.is_workspace_member(
      ((regexp_match(name, '^workspaces/([^/]+)/'))[1])::uuid
    )
  );

CREATE POLICY "ktp-snapshots: editor insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'ktp-snapshots'
    AND (regexp_match(name, '^workspaces/([^/]+)/'))[1] IS NOT NULL
    AND ktp.is_workspace_member(
      ((regexp_match(name, '^workspaces/([^/]+)/'))[1])::uuid
    )
    AND ktp.has_min_role(
      ((regexp_match(name, '^workspaces/([^/]+)/'))[1])::uuid,
      ARRAY['owner', 'admin', 'editor']
    )
  );

CREATE POLICY "ktp-snapshots: admin delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'ktp-snapshots'
    AND (regexp_match(name, '^workspaces/([^/]+)/'))[1] IS NOT NULL
    AND ktp.has_min_role(
      ((regexp_match(name, '^workspaces/([^/]+)/'))[1])::uuid,
      ARRAY['owner', 'admin']
    )
  );

-- ─── ktp-backups policies ────────────────────────────────────────────────────

CREATE POLICY "ktp-backups: member select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'ktp-backups'
    AND (regexp_match(name, '^workspaces/([^/]+)/'))[1] IS NOT NULL
    AND ktp.is_workspace_member(
      ((regexp_match(name, '^workspaces/([^/]+)/'))[1])::uuid
    )
  );

CREATE POLICY "ktp-backups: editor insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'ktp-backups'
    AND (regexp_match(name, '^workspaces/([^/]+)/'))[1] IS NOT NULL
    AND ktp.is_workspace_member(
      ((regexp_match(name, '^workspaces/([^/]+)/'))[1])::uuid
    )
    AND ktp.has_min_role(
      ((regexp_match(name, '^workspaces/([^/]+)/'))[1])::uuid,
      ARRAY['owner', 'admin', 'editor']
    )
  );

CREATE POLICY "ktp-backups: admin delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'ktp-backups'
    AND (regexp_match(name, '^workspaces/([^/]+)/'))[1] IS NOT NULL
    AND ktp.has_min_role(
      ((regexp_match(name, '^workspaces/([^/]+)/'))[1])::uuid,
      ARRAY['owner', 'admin']
    )
  );
