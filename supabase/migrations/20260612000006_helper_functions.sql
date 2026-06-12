-- Migration 6: RLS helper functions.
-- (Moved from migration 2; reordered to run after all tables are created.)
-- Must run before migration 8 (RLS policies), which references these functions.
-- All are SECURITY DEFINER + locked search_path to prevent schema injection.

CREATE OR REPLACE FUNCTION ktp.is_workspace_member(ws_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ktp, auth, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM ktp.workspace_members wm
    WHERE wm.workspace_id = ws_id
      AND wm.user_id      = auth.uid()
      AND wm.deleted_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION ktp.workspace_member_role(ws_id uuid)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ktp, auth, public
AS $$
  SELECT wm.member_role
  FROM ktp.workspace_members wm
  WHERE wm.workspace_id = ws_id
    AND wm.user_id      = auth.uid()
    AND wm.deleted_at IS NULL
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION ktp.has_min_role(ws_id uuid, allowed_roles text[])
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ktp, auth, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM ktp.workspace_members wm
    WHERE wm.workspace_id = ws_id
      AND wm.user_id      = auth.uid()
      AND wm.deleted_at IS NULL
      AND wm.member_role  = ANY(allowed_roles)
  );
$$;
