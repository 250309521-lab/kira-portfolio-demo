-- ════════════════════════════════════════════════════════════════
-- Kira Takip Pro — Supabase Schema
-- 
-- SETUP STEPS:
-- 1. Go to: https://supabase.com/dashboard
-- 2. Open your project (xhyfbkhddcosapkhtoyb)
-- 3. Click "SQL Editor" in left sidebar
-- 4. Paste this entire file and click "Run"
-- ════════════════════════════════════════════════════════════════

-- ── Main sync table ────────────────────────────────────────────
-- Stores the full app snapshot as a JSON blob.
-- One row per app installation (id = 'ktp_main').
CREATE TABLE IF NOT EXISTS ktp_sync (
  id          TEXT PRIMARY KEY DEFAULT 'ktp_main',
  data_json   TEXT NOT NULL DEFAULT '{}',
  version     INTEGER DEFAULT 0,
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  app_version TEXT DEFAULT '5.1.6'
);

-- ── Activity log ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ktp_activity_log (
  id          BIGSERIAL PRIMARY KEY,
  ts          TIMESTAMPTZ DEFAULT NOW(),
  user_name   TEXT,
  action      TEXT NOT NULL,
  details     TEXT
);

-- ── Enable Row Level Security ──────────────────────────────────
ALTER TABLE ktp_sync         ENABLE ROW LEVEL SECURITY;
ALTER TABLE ktp_activity_log ENABLE ROW LEVEL SECURITY;

-- ── Policies: allow anon key full access ───────────────────────
-- (Fine for personal/small-team use with anon key)
-- For production multi-tenant, restrict by user_id instead.

-- ktp_sync policies
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='ktp_sync' AND policyname='anon_select'
  ) THEN
    CREATE POLICY anon_select ON ktp_sync FOR SELECT USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='ktp_sync' AND policyname='anon_insert'
  ) THEN
    CREATE POLICY anon_insert ON ktp_sync FOR INSERT WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='ktp_sync' AND policyname='anon_update'
  ) THEN
    CREATE POLICY anon_update ON ktp_sync FOR UPDATE USING (true);
  END IF;
END $$;

-- ktp_activity_log policies
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='ktp_activity_log' AND policyname='anon_select'
  ) THEN
    CREATE POLICY anon_select ON ktp_activity_log FOR SELECT USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='ktp_activity_log' AND policyname='anon_insert'
  ) THEN
    CREATE POLICY anon_insert ON ktp_activity_log FOR INSERT WITH CHECK (true);
  END IF;
END $$;

-- ── Verify setup ───────────────────────────────────────────────
SELECT 'ktp_sync table: OK' WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='ktp_sync');
SELECT 'ktp_activity_log table: OK' WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='ktp_activity_log');
