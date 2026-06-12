-- Migration 5: cloud tables — cloud_backups, audit_logs.
-- (Moved from migration 6; reordered so all tables precede helper functions.)

-- cloud_backups: metadata for cloud-stored .ktpbackup archives.
-- "backup_trigger" avoids conflict with the PostgreSQL keyword "trigger".
CREATE TABLE ktp.cloud_backups (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid        NOT NULL REFERENCES ktp.workspaces(id) ON DELETE CASCADE,
  created_by      uuid        NOT NULL REFERENCES ktp.accounts(id)   ON DELETE RESTRICT,
  device_id       uuid        REFERENCES ktp.devices(id)             ON DELETE SET NULL,
  backup_trigger  text        NOT NULL
                                CHECK (backup_trigger IN ('manual', 'auto', 'pre_restore', 'migration')),
  storage_path    text        NOT NULL,
  byte_size       bigint      NOT NULL CHECK (byte_size > 0),
  checksum        text        NOT NULL CHECK (checksum ~ '^[0-9a-f]{64}$'),
  app_version     text        CHECK (char_length(app_version) <= 32),
  format_version  integer     NOT NULL DEFAULT 1 CHECK (format_version >= 1),
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ktp.cloud_backups ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_cloud_backups_ws ON ktp.cloud_backups (workspace_id, created_at DESC);

-- audit_logs: append-only, immutable to client JWTs.
-- Three-layer immutability:
--   1. No INSERT/UPDATE/DELETE RLS policy for authenticated role.
--   2. REVOKE below strips direct write access from authenticated role.
--   3. Only SECURITY DEFINER RPCs (running as postgres) may write.
CREATE TABLE ktp.audit_logs (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid        NOT NULL REFERENCES ktp.workspaces(id) ON DELETE CASCADE,
  user_id       uuid        NOT NULL REFERENCES ktp.accounts(id)   ON DELETE RESTRICT,
  device_id     uuid        REFERENCES ktp.devices(id)             ON DELETE SET NULL,
  action        text        NOT NULL CHECK (char_length(action) <= 128),
  detail        jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ktp.audit_logs ENABLE ROW LEVEL SECURITY;

-- Strip direct write access. SECURITY DEFINER functions run as their definer
-- (postgres superuser) and bypass this restriction.
REVOKE INSERT, UPDATE, DELETE ON ktp.audit_logs FROM authenticated;

CREATE INDEX idx_audit_ws   ON ktp.audit_logs (workspace_id, created_at DESC);
CREATE INDEX idx_audit_user ON ktp.audit_logs (user_id);
