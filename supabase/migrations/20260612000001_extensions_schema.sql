-- Migration 1: extensions and application schema.
-- Must run first; all subsequent migrations depend on this.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
-- pg_cron is optional; used only for future scheduled lock cleanup.
-- Remove this line if your Supabase project does not have pg_cron enabled.
CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA cron;

CREATE SCHEMA IF NOT EXISTS ktp;
COMMENT ON SCHEMA ktp IS 'KiraTakipPro cloud application schema';

-- Grant schema visibility to app roles.
-- RLS on each table is the actual security layer; this allows roles to
-- reference ktp objects at all (function calls, SELECT with RLS filter, etc.).
GRANT USAGE ON SCHEMA ktp TO authenticated, anon;

-- All tables created in ktp by postgres automatically get SELECT for app roles.
-- No INSERT/UPDATE/DELETE is granted — writes go through SECURITY DEFINER RPCs.
ALTER DEFAULT PRIVILEGES IN SCHEMA ktp
  GRANT SELECT ON TABLES TO authenticated, anon;

ALTER DEFAULT PRIVILEGES IN SCHEMA ktp
  GRANT USAGE, SELECT ON SEQUENCES TO authenticated, anon;
