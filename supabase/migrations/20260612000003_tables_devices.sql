-- Migration 3: devices table.
-- (Moved from migration 4; reordered so all tables precede helper functions.)
-- The UUID format CHECK constraint prevents machine fingerprint storage.
-- A raw 64-char hex machine fingerprint cannot satisfy the RFC 4122 hyphenated UUID pattern.

CREATE TABLE ktp.devices (
  id            uuid        PRIMARY KEY,
  user_id       uuid        NOT NULL REFERENCES ktp.accounts(id)   ON DELETE CASCADE,
  workspace_id  uuid        REFERENCES ktp.workspaces(id) ON DELETE SET NULL,
  device_name   text        CHECK (char_length(device_name) <= 255),
  app_version   text        CHECK (char_length(app_version) <= 32),
  platform      text        CHECK (platform IN ('darwin', 'win32', 'linux')),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),

  -- Enforce RFC 4122 UUID format: 8-4-4-4-12 lowercase hex chars with hyphens.
  -- A raw 64-char hex machine fingerprint (sha256) cannot satisfy this pattern.
  CONSTRAINT chk_device_id_is_uuid CHECK (
    id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  )
);

ALTER TABLE ktp.devices ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_devices_user      ON ktp.devices (user_id);
CREATE INDEX idx_devices_workspace ON ktp.devices (workspace_id) WHERE workspace_id IS NOT NULL;
