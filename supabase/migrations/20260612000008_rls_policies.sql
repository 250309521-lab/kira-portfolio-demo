-- Migration 8: Row Level Security policies for all ktp.* tables.
-- Default-deny: no access unless explicitly granted below.
-- All write operations must go through SECURITY DEFINER RPCs (migration 9).
-- Storage object policies are in migration 10.

-- ─── ktp.accounts ────────────────────────────────────────────────────────────

-- User reads/updates their own account
CREATE POLICY "accounts: own select"
  ON ktp.accounts FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY "accounts: own update"
  ON ktp.accounts FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- Workspace co-members can read each other's display info
CREATE POLICY "accounts: co-member select"
  ON ktp.accounts FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM ktp.workspace_members wm
      WHERE wm.user_id    = ktp.accounts.id
        AND wm.deleted_at IS NULL
        AND ktp.is_workspace_member(wm.workspace_id)
    )
  );

-- ─── ktp.workspaces ──────────────────────────────────────────────────────────

CREATE POLICY "workspaces: member select"
  ON ktp.workspaces FOR SELECT TO authenticated
  USING (ktp.is_workspace_member(id) AND deleted_at IS NULL);

CREATE POLICY "workspaces: owner update"
  ON ktp.workspaces FOR UPDATE TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- ─── ktp.workspace_members ───────────────────────────────────────────────────

CREATE POLICY "workspace_members: member select"
  ON ktp.workspace_members FOR SELECT TO authenticated
  USING (ktp.is_workspace_member(workspace_id) AND deleted_at IS NULL);

-- No INSERT/UPDATE/DELETE policy — all writes go through RPCs.

-- ─── ktp.invite_tokens ───────────────────────────────────────────────────────

-- Workspace admins/owners manage tokens for their workspace
CREATE POLICY "invite_tokens: admin select"
  ON ktp.invite_tokens FOR SELECT TO authenticated
  USING (ktp.has_min_role(workspace_id, ARRAY['owner', 'admin']));

-- No accept-read policy needed: accept_invite RPC is SECURITY DEFINER
-- and bypasses RLS when reading the token by value.

-- ─── ktp.devices ─────────────────────────────────────────────────────────────

CREATE POLICY "devices: own select"
  ON ktp.devices FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "devices: workspace select"
  ON ktp.devices FOR SELECT TO authenticated
  USING (
    workspace_id IS NOT NULL
    AND ktp.is_workspace_member(workspace_id)
  );

-- ─── ktp.workspace_snapshots ─────────────────────────────────────────────────

CREATE POLICY "workspace_snapshots: member select"
  ON ktp.workspace_snapshots FOR SELECT TO authenticated
  USING (ktp.is_workspace_member(workspace_id));

-- ─── ktp.workspace_locks ─────────────────────────────────────────────────────

CREATE POLICY "workspace_locks: member select"
  ON ktp.workspace_locks FOR SELECT TO authenticated
  USING (ktp.is_workspace_member(workspace_id));

-- ─── ktp.cloud_backups ───────────────────────────────────────────────────────

CREATE POLICY "cloud_backups: member select"
  ON ktp.cloud_backups FOR SELECT TO authenticated
  USING (ktp.is_workspace_member(workspace_id));

-- ─── ktp.audit_logs ──────────────────────────────────────────────────────────

-- Read-only for members; direct writes revoked in migration 6.
CREATE POLICY "audit_logs: member select"
  ON ktp.audit_logs FOR SELECT TO authenticated
  USING (ktp.is_workspace_member(workspace_id));
