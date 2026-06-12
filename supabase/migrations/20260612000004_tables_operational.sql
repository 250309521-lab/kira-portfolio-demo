-- Migration 4: operational tables — workspace_snapshots, workspace_locks.
-- (Moved from migration 5; reordered so all tables precede helper functions.)

-- workspace_snapshots: immutable append-only log of sync revisions.
-- Revision is 1-based; CAS enforced by push_snapshot_with_revision_check RPC.
CREATE TABLE ktp.workspace_snapshots (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid        NOT NULL REFERENCES ktp.workspaces(id) ON DELETE CASCADE,
  pushed_by     uuid        NOT NULL REFERENCES ktp.accounts(id)   ON DELETE RESTRICT,
  device_id     uuid        REFERENCES ktp.devices(id)             ON DELETE SET NULL,
  revision      bigint      NOT NULL CHECK (revision >= 1),
  snapshot_hash text        NOT NULL CHECK (snapshot_hash ~ '^[0-9a-f]{64}$'),
  storage_path  text        NOT NULL,
  byte_size     bigint      NOT NULL CHECK (byte_size > 0),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, revision)
);

ALTER TABLE ktp.workspace_snapshots ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_snapshots_ws_rev ON ktp.workspace_snapshots (workspace_id, revision DESC);

-- workspace_locks: one row per workspace, seeded by trigger on_workspace_created.
-- Lock is considered FREE when expires_at < now().
-- chk_lock_expiry ensures the row is always in a consistent state.
CREATE TABLE ktp.workspace_locks (
  workspace_id  uuid        PRIMARY KEY REFERENCES ktp.workspaces(id) ON DELETE CASCADE,
  held_by       uuid        NOT NULL REFERENCES ktp.accounts(id)      ON DELETE CASCADE,
  device_id     uuid        REFERENCES ktp.devices(id)                ON DELETE SET NULL,
  lease_token   text        NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  acquired_at   timestamptz NOT NULL DEFAULT (now() - interval '2 seconds'),
  expires_at    timestamptz NOT NULL DEFAULT (now() - interval '1 second'),
  CONSTRAINT chk_lock_expiry CHECK (expires_at > acquired_at)
);

ALTER TABLE ktp.workspace_locks ENABLE ROW LEVEL SECURITY;
