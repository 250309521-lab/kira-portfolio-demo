-- Migration 9: SECURITY DEFINER RPC functions.
-- All functions:
--   • SECURITY DEFINER — runs as function owner (postgres), bypasses RLS
--   • SET search_path = ktp, auth, storage, extensions, public — prevents search_path injection
-- Client JWT never needs privileged operations; everything goes through these RPCs.

-- ─── ktp.register_device ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ktp.register_device(
  p_device_id   uuid,
  p_device_name text    DEFAULT NULL,
  p_platform    text    DEFAULT NULL,
  p_app_version text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ktp, auth, storage, extensions, public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  -- UUID format is enforced by the table chk_device_id_is_uuid constraint.
  INSERT INTO ktp.devices (id, user_id, device_name, platform, app_version, last_seen_at, created_at)
  VALUES (p_device_id, v_user_id, p_device_name, p_platform, p_app_version, now(), now())
  ON CONFLICT (id) DO UPDATE SET
    device_name  = EXCLUDED.device_name,
    app_version  = EXCLUDED.app_version,
    platform     = EXCLUDED.platform,
    last_seen_at = now();

  RETURN jsonb_build_object('ok', true, 'device_id', p_device_id);
EXCEPTION
  WHEN check_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_device_id');
END;
$$;

-- ─── ktp.create_workspace ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ktp.create_workspace(
  p_name               text,
  p_local_workspace_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ktp, auth, storage, extensions, public
AS $$
DECLARE
  v_user_id      uuid := auth.uid();
  v_workspace_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  IF p_name IS NULL OR char_length(trim(p_name)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_name');
  END IF;

  IF p_local_workspace_id IS NULL OR char_length(trim(p_local_workspace_id)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_local_workspace_id');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM ktp.accounts WHERE id = v_user_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'account_not_found');
  END IF;

  INSERT INTO ktp.workspaces (name, owner_id, local_workspace_id, plan, max_members)
  VALUES (trim(p_name), v_user_id, trim(p_local_workspace_id), 'free', 1)
  RETURNING id INTO v_workspace_id;

  -- on_workspace_created trigger seeds workspace_locks row automatically.

  INSERT INTO ktp.workspace_members (workspace_id, user_id, member_role, invited_by)
  VALUES (v_workspace_id, v_user_id, 'owner', v_user_id);

  INSERT INTO ktp.audit_logs (workspace_id, user_id, action, detail)
  VALUES (v_workspace_id, v_user_id, 'workspace_created',
          jsonb_build_object('name', trim(p_name),
                             'local_workspace_id', trim(p_local_workspace_id)));

  RETURN jsonb_build_object(
    'ok',                true,
    'workspace_id',      v_workspace_id,
    'local_workspace_id', trim(p_local_workspace_id)
  );
EXCEPTION
  WHEN check_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
  WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'local_workspace_id_conflict');
END;
$$;

-- ─── ktp.create_invite_token ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ktp.create_invite_token(
  p_workspace_id  uuid,
  p_role          text    DEFAULT 'viewer',
  p_max_uses      integer DEFAULT 1,
  p_expires_hours integer DEFAULT 168
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ktp, auth, storage, extensions, public
AS $$
DECLARE
  v_user_id   uuid := auth.uid();
  v_token_row ktp.invite_tokens;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  IF NOT ktp.has_min_role(p_workspace_id, ARRAY['owner', 'admin']) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'permission_denied');
  END IF;

  IF p_role NOT IN ('admin', 'editor', 'viewer') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_role');
  END IF;

  IF p_max_uses < 1 OR p_max_uses > 1000 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_max_uses');
  END IF;

  IF p_expires_hours < 1 OR p_expires_hours > 8760 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_expires_hours');
  END IF;

  INSERT INTO ktp.invite_tokens (workspace_id, token_role, created_by, expires_at, max_uses)
  VALUES (
    p_workspace_id, p_role, v_user_id,
    now() + (p_expires_hours * interval '1 hour'),
    p_max_uses
  )
  RETURNING * INTO v_token_row;

  INSERT INTO ktp.audit_logs (workspace_id, user_id, action, detail)
  VALUES (p_workspace_id, v_user_id, 'invite_token_created',
          jsonb_build_object('token_id', v_token_row.id, 'role', p_role));

  RETURN jsonb_build_object(
    'ok',         true,
    'token_id',   v_token_row.id,
    'token',      v_token_row.token,
    'expires_at', v_token_row.expires_at
  );
END;
$$;

-- ─── ktp.accept_invite ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ktp.accept_invite(
  p_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ktp, auth, storage, extensions, public
AS $$
DECLARE
  v_user_id  uuid := auth.uid();
  v_token    ktp.invite_tokens;
  v_ws       ktp.workspaces;
  v_count    integer;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT * INTO v_token FROM ktp.invite_tokens WHERE token = p_token;
  IF NOT FOUND                     THEN RETURN jsonb_build_object('ok', false, 'error', 'token_not_found'); END IF;
  IF v_token.revoked               THEN RETURN jsonb_build_object('ok', false, 'error', 'token_revoked');   END IF;
  IF v_token.expires_at < now()    THEN RETURN jsonb_build_object('ok', false, 'error', 'token_expired');   END IF;
  IF v_token.use_count >= v_token.max_uses THEN
    RETURN jsonb_build_object('ok', false, 'error', 'token_exhausted');
  END IF;

  SELECT * INTO v_ws FROM ktp.workspaces
  WHERE id = v_token.workspace_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'workspace_not_found'); END IF;

  SELECT COUNT(*) INTO v_count FROM ktp.workspace_members
  WHERE workspace_id = v_token.workspace_id AND deleted_at IS NULL;
  IF v_count >= v_ws.max_members THEN
    RETURN jsonb_build_object('ok', false, 'error', 'workspace_full');
  END IF;

  IF ktp.is_workspace_member(v_token.workspace_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_member');
  END IF;

  INSERT INTO ktp.workspace_members (workspace_id, user_id, member_role, invited_by)
  VALUES (v_token.workspace_id, v_user_id, v_token.token_role, v_token.created_by)
  ON CONFLICT (workspace_id, user_id) DO UPDATE SET
    member_role = EXCLUDED.member_role,
    deleted_at  = NULL;

  UPDATE ktp.invite_tokens SET
    use_count = use_count + 1,
    used_by   = CASE WHEN use_count = 0 THEN v_user_id ELSE used_by END,
    used_at   = CASE WHEN use_count = 0 THEN now()     ELSE used_at END
  WHERE id = v_token.id;

  INSERT INTO ktp.audit_logs (workspace_id, user_id, action, detail)
  VALUES (v_token.workspace_id, v_user_id, 'invite_accepted',
          jsonb_build_object('token_id', v_token.id, 'role', v_token.token_role));

  RETURN jsonb_build_object(
    'ok',           true,
    'workspace_id', v_token.workspace_id,
    'role',         v_token.token_role
  );
END;
$$;

-- ─── ktp.get_sync_status ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ktp.get_sync_status(
  p_workspace_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ktp, auth, storage, extensions, public
AS $$
DECLARE
  v_user_id   uuid := auth.uid();
  v_revision  bigint;
  v_lock      ktp.workspace_locks;
  v_lock_free boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  IF NOT ktp.is_workspace_member(p_workspace_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_member');
  END IF;

  SELECT COALESCE(MAX(revision), 0) INTO v_revision
  FROM ktp.workspace_snapshots WHERE workspace_id = p_workspace_id;

  SELECT * INTO v_lock FROM ktp.workspace_locks WHERE workspace_id = p_workspace_id;
  v_lock_free := NOT FOUND OR v_lock.expires_at < now();

  RETURN jsonb_build_object(
    'ok',              true,
    'current_revision', v_revision,
    'lock_free',        v_lock_free,
    'lock_held_by',     CASE WHEN v_lock_free THEN NULL ELSE v_lock.held_by  END,
    'lock_expires_at',  CASE WHEN v_lock_free THEN NULL ELSE v_lock.expires_at END
  );
END;
$$;

-- ─── ktp.acquire_lock ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ktp.acquire_lock(
  p_workspace_id  uuid,
  p_device_id     uuid    DEFAULT NULL,
  p_lease_seconds integer DEFAULT 300
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ktp, auth, storage, extensions, public
AS $$
DECLARE
  v_user_id   uuid := auth.uid();
  v_lock      ktp.workspace_locks;
  v_new_token text;
  v_expires   timestamptz;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  IF NOT ktp.is_workspace_member(p_workspace_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_member');
  END IF;

  IF NOT ktp.has_min_role(p_workspace_id, ARRAY['owner', 'admin', 'editor']) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'permission_denied');
  END IF;

  IF p_lease_seconds < 10 OR p_lease_seconds > 3600 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_lease_duration');
  END IF;

  -- Exclusive row lock serializes concurrent acquire attempts.
  SELECT * INTO v_lock FROM ktp.workspace_locks
  WHERE workspace_id = p_workspace_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'lock_row_missing');
  END IF;

  -- Another user holds a valid (non-expired) lock.
  IF v_lock.expires_at > now() AND v_lock.held_by != v_user_id THEN
    RETURN jsonb_build_object(
      'ok',         false,
      'error',      'locked',
      'held_by',    v_lock.held_by,
      'expires_at', v_lock.expires_at
    );
  END IF;

  v_new_token := encode(gen_random_bytes(16), 'hex');
  v_expires   := now() + (p_lease_seconds * interval '1 second');

  UPDATE ktp.workspace_locks SET
    held_by     = v_user_id,
    device_id   = p_device_id,
    lease_token = v_new_token,
    acquired_at = now(),
    expires_at  = v_expires
  WHERE workspace_id = p_workspace_id;

  INSERT INTO ktp.audit_logs (workspace_id, user_id, device_id, action, detail)
  VALUES (p_workspace_id, v_user_id, p_device_id, 'lock_acquired',
          jsonb_build_object('lease_seconds', p_lease_seconds));

  RETURN jsonb_build_object('ok', true, 'lease_token', v_new_token, 'expires_at', v_expires);
END;
$$;

-- ─── ktp.renew_lock ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ktp.renew_lock(
  p_workspace_id  uuid,
  p_lease_token   text,
  p_lease_seconds integer DEFAULT 300
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ktp, auth, storage, extensions, public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_lock    ktp.workspace_locks;
  v_expires timestamptz;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  IF p_lease_seconds < 10 OR p_lease_seconds > 3600 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_lease_duration');
  END IF;

  SELECT * INTO v_lock FROM ktp.workspace_locks
  WHERE workspace_id = p_workspace_id FOR UPDATE;

  IF NOT FOUND                      THEN RETURN jsonb_build_object('ok', false, 'error', 'lock_row_missing');    END IF;
  IF v_lock.lease_token != p_lease_token THEN RETURN jsonb_build_object('ok', false, 'error', 'invalid_lease_token'); END IF;
  IF v_lock.held_by != v_user_id   THEN RETURN jsonb_build_object('ok', false, 'error', 'not_lock_holder');     END IF;
  IF v_lock.expires_at < now()      THEN RETURN jsonb_build_object('ok', false, 'error', 'lock_expired');        END IF;

  v_expires := now() + (p_lease_seconds * interval '1 second');

  UPDATE ktp.workspace_locks SET expires_at = v_expires WHERE workspace_id = p_workspace_id;

  RETURN jsonb_build_object('ok', true, 'expires_at', v_expires);
END;
$$;

-- ─── ktp.release_lock ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ktp.release_lock(
  p_workspace_id uuid,
  p_lease_token  text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ktp, auth, storage, extensions, public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_lock    ktp.workspace_locks;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT * INTO v_lock FROM ktp.workspace_locks
  WHERE workspace_id = p_workspace_id FOR UPDATE;

  IF NOT FOUND                           THEN RETURN jsonb_build_object('ok', false, 'error', 'lock_row_missing');    END IF;
  IF v_lock.lease_token != p_lease_token THEN RETURN jsonb_build_object('ok', false, 'error', 'invalid_lease_token'); END IF;
  IF v_lock.held_by != v_user_id         THEN RETURN jsonb_build_object('ok', false, 'error', 'not_lock_holder');     END IF;

  -- Set both acquired_at and expires_at to past to satisfy chk_lock_expiry constraint.
  UPDATE ktp.workspace_locks SET
    acquired_at = now() - interval '2 seconds',
    expires_at  = now() - interval '1 second'
  WHERE workspace_id = p_workspace_id;

  INSERT INTO ktp.audit_logs (workspace_id, user_id, action, detail)
  VALUES (p_workspace_id, v_user_id, 'lock_released', '{}'::jsonb);

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ─── ktp.force_unlock ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ktp.force_unlock(
  p_workspace_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ktp, auth, storage, extensions, public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  IF NOT ktp.has_min_role(p_workspace_id, ARRAY['owner', 'admin']) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'permission_denied');
  END IF;

  UPDATE ktp.workspace_locks SET
    acquired_at = now() - interval '2 seconds',
    expires_at  = now() - interval '1 second'
  WHERE workspace_id = p_workspace_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'lock_row_missing');
  END IF;

  INSERT INTO ktp.audit_logs (workspace_id, user_id, action, detail)
  VALUES (p_workspace_id, v_user_id, 'lock_force_unlocked', '{}'::jsonb);

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ─── ktp.push_snapshot_with_revision_check ───────────────────────────────────
-- CAS (compare-and-swap) revision check serialized by FOR UPDATE on workspace_locks.
-- Caller must already hold a valid lease (lease_token + held_by + not expired).

CREATE OR REPLACE FUNCTION ktp.push_snapshot_with_revision_check(
  p_workspace_id  uuid,
  p_lease_token   text,
  p_base_revision bigint,
  p_storage_path  text,
  p_snapshot_hash text,
  p_byte_size     bigint,
  p_device_id     uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ktp, auth, storage, extensions, public
AS $$
DECLARE
  v_user_id     uuid := auth.uid();
  v_lock        ktp.workspace_locks;
  v_current_rev bigint;
  v_new_rev     bigint;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  IF NOT ktp.is_workspace_member(p_workspace_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_member');
  END IF;

  IF NOT ktp.has_min_role(p_workspace_id, ARRAY['owner', 'admin', 'editor']) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'permission_denied');
  END IF;

  IF p_snapshot_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_snapshot_hash');
  END IF;

  IF p_byte_size <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_byte_size');
  END IF;

  -- Step 1: Exclusive row lock — serializes all concurrent pushes.
  SELECT * INTO v_lock FROM ktp.workspace_locks
  WHERE workspace_id = p_workspace_id FOR UPDATE;

  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'lock_row_missing'); END IF;

  -- Step 2: Verify caller holds valid lease.
  IF v_lock.lease_token != p_lease_token THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_lease_token');
  END IF;
  IF v_lock.held_by != v_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_lock_holder');
  END IF;
  IF v_lock.expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'lease_expired');
  END IF;

  -- Step 3: CAS — verify base revision matches server current.
  SELECT COALESCE(MAX(revision), 0) INTO v_current_rev
  FROM ktp.workspace_snapshots WHERE workspace_id = p_workspace_id;

  IF v_current_rev != p_base_revision THEN
    RETURN jsonb_build_object(
      'ok',              false,
      'error',           'stale',
      'current_revision', v_current_rev
    );
  END IF;

  -- Step 4: Insert snapshot at next revision.
  v_new_rev := p_base_revision + 1;

  INSERT INTO ktp.workspace_snapshots (
    workspace_id, pushed_by, device_id, revision,
    snapshot_hash, storage_path, byte_size
  ) VALUES (
    p_workspace_id, v_user_id, p_device_id, v_new_rev,
    p_snapshot_hash, p_storage_path, p_byte_size
  );

  -- Step 5: Audit.
  INSERT INTO ktp.audit_logs (workspace_id, user_id, device_id, action, detail)
  VALUES (p_workspace_id, v_user_id, p_device_id, 'snapshot_pushed',
          jsonb_build_object('revision', v_new_rev, 'byte_size', p_byte_size));

  RETURN jsonb_build_object('ok', true, 'new_revision', v_new_rev);
END;
$$;

-- ─── ktp.get_latest_snapshot_metadata ────────────────────────────────────────
-- Returns storage_path and metadata only.
-- Signed URL generation is the responsibility of the Electron main process:
--   supabase.storage.from('ktp-snapshots').createSignedUrl(storage_path, expiry)
-- Reason: storage.create_signed_url() is not reliably callable from PL/pgSQL
-- SECURITY DEFINER functions across all Supabase versions.

CREATE OR REPLACE FUNCTION ktp.get_latest_snapshot_metadata(
  p_workspace_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ktp, auth, storage, extensions, public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_snap    ktp.workspace_snapshots;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  IF NOT ktp.is_workspace_member(p_workspace_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_member');
  END IF;

  SELECT * INTO v_snap FROM ktp.workspace_snapshots
  WHERE workspace_id = p_workspace_id ORDER BY revision DESC LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'snapshot', NULL);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'snapshot', jsonb_build_object(
      'id',            v_snap.id,
      'revision',      v_snap.revision,
      'snapshot_hash', v_snap.snapshot_hash,
      'storage_path',  v_snap.storage_path,
      'byte_size',     v_snap.byte_size,
      'pushed_by',     v_snap.pushed_by,
      'created_at',    v_snap.created_at
    )
  );
END;
$$;

-- ─── ktp.create_cloud_backup_metadata ────────────────────────────────────────

CREATE OR REPLACE FUNCTION ktp.create_cloud_backup_metadata(
  p_workspace_id   uuid,
  p_storage_path   text,
  p_byte_size      bigint,
  p_checksum       text,
  p_backup_trigger text    DEFAULT 'manual',
  p_app_version    text    DEFAULT NULL,
  p_device_id      uuid    DEFAULT NULL,
  p_format_version integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ktp, auth, storage, extensions, public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_backup  ktp.cloud_backups;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  IF NOT ktp.is_workspace_member(p_workspace_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_member');
  END IF;

  IF NOT ktp.has_min_role(p_workspace_id, ARRAY['owner', 'admin', 'editor']) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'permission_denied');
  END IF;

  IF p_checksum !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_checksum');
  END IF;

  IF p_byte_size <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_byte_size');
  END IF;

  IF p_backup_trigger NOT IN ('manual', 'auto', 'pre_restore', 'migration') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_trigger');
  END IF;

  INSERT INTO ktp.cloud_backups (
    workspace_id, created_by, device_id, backup_trigger,
    storage_path, byte_size, checksum, app_version, format_version
  ) VALUES (
    p_workspace_id, v_user_id, p_device_id, p_backup_trigger,
    p_storage_path, p_byte_size, p_checksum, p_app_version, p_format_version
  )
  RETURNING * INTO v_backup;

  INSERT INTO ktp.audit_logs (workspace_id, user_id, device_id, action, detail)
  VALUES (p_workspace_id, v_user_id, p_device_id, 'cloud_backup_created',
          jsonb_build_object('backup_id', v_backup.id, 'trigger', p_backup_trigger));

  RETURN jsonb_build_object('ok', true, 'backup_id', v_backup.id);
END;
$$;

-- ─── ktp.create_backup_download_url ──────────────────────────────────────────
-- Returns storage_path + bucket only; Electron main process must call:
--   supabase.storage.from('ktp-backups').createSignedUrl(path, expiresIn)
-- with the user's JWT. No service-role key is required or used.

CREATE OR REPLACE FUNCTION ktp.create_backup_download_url(
  p_workspace_id uuid,
  p_backup_id    uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ktp, auth, storage, extensions, public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_backup  ktp.cloud_backups;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  IF NOT ktp.is_workspace_member(p_workspace_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_member');
  END IF;

  SELECT * INTO v_backup FROM ktp.cloud_backups
  WHERE id = p_backup_id AND workspace_id = p_workspace_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'backup_not_found');
  END IF;

  RETURN jsonb_build_object(
    'ok',           true,
    'bucket',       'ktp-backups',
    'storage_path', v_backup.storage_path,
    'checksum',     v_backup.checksum,
    'byte_size',    v_backup.byte_size
  );
END;
$$;
