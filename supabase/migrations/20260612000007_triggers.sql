-- Migration 7: triggers.
-- 1. auth.users INSERT → ktp.accounts (user signup sync)
-- 2. ktp.workspaces INSERT → ktp.workspace_locks (seed lock row)
-- 3. updated_at maintenance for accounts and workspaces

-- ── 1. Sync new auth users to ktp.accounts ───────────────────────────────────
CREATE OR REPLACE FUNCTION ktp.on_auth_user_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ktp, auth, public
AS $$
BEGIN
  INSERT INTO ktp.accounts (id, email, display_name, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    now(),
    now()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION ktp.on_auth_user_created();

-- ── 2. Seed workspace_locks row on workspace creation ────────────────────────
-- The lock row must exist before any acquire_lock call can SELECT FOR UPDATE.
-- Initial state: expires_at is in the past → lock is free.
CREATE OR REPLACE FUNCTION ktp.on_workspace_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ktp, auth, public
AS $$
BEGIN
  INSERT INTO ktp.workspace_locks (
    workspace_id, held_by, acquired_at, expires_at
  ) VALUES (
    NEW.id,
    NEW.owner_id,
    now() - interval '2 seconds',
    now() - interval '1 second'
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_workspace_created
  AFTER INSERT ON ktp.workspaces
  FOR EACH ROW EXECUTE FUNCTION ktp.on_workspace_created();

-- ── 3. updated_at maintenance ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION ktp.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER accounts_set_updated_at
  BEFORE UPDATE ON ktp.accounts
  FOR EACH ROW EXECUTE FUNCTION ktp.set_updated_at();

CREATE TRIGGER workspaces_set_updated_at
  BEFORE UPDATE ON ktp.workspaces
  FOR EACH ROW EXECUTE FUNCTION ktp.set_updated_at();
