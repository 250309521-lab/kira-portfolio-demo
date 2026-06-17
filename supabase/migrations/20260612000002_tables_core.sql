-- Migration 2: core tables — accounts, workspaces, workspace_members, invite_tokens.
-- Tables must be created before migration 6 (helper functions), which references workspace_members.

-- On Supabase cloud, pgcrypto is pre-installed in the extensions schema.
-- SET search_path ensures gen_random_bytes() resolves at CREATE TABLE time.
SET search_path TO extensions, public;

-- ktp.accounts mirrors auth.users (populated by trigger in migration 7)
CREATE TABLE ktp.accounts (
  id            uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email         text        NOT NULL,
  display_name  text,
  plan          text        NOT NULL DEFAULT 'free'
                              CHECK (plan IN ('free', 'pro', 'team')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ktp.accounts ENABLE ROW LEVEL SECURITY;

-- ktp.workspaces
-- local_workspace_id: maps the Electron-side DATA.workspaceId to its cloud counterpart.
-- Unique constraint prevents the same local workspace from being registered twice.
CREATE TABLE ktp.workspaces (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name               text        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 255),
  owner_id           uuid        NOT NULL REFERENCES ktp.accounts(id) ON DELETE RESTRICT,
  local_workspace_id text        NOT NULL UNIQUE
                                   CHECK (char_length(local_workspace_id) BETWEEN 1 AND 128),
  plan               text        NOT NULL DEFAULT 'free'
                                   CHECK (plan IN ('free', 'pro', 'team')),
  max_members        integer     NOT NULL DEFAULT 1 CHECK (max_members >= 1),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  deleted_at         timestamptz
);

ALTER TABLE ktp.workspaces ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_workspaces_owner       ON ktp.workspaces (owner_id)           WHERE deleted_at IS NULL;
CREATE INDEX idx_workspaces_local_ws_id ON ktp.workspaces (local_workspace_id) WHERE deleted_at IS NULL;

-- ktp.workspace_members
-- "member_role" avoids conflict with the SQL reserved word "role".
CREATE TABLE ktp.workspace_members (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid        NOT NULL REFERENCES ktp.workspaces(id) ON DELETE CASCADE,
  user_id       uuid        NOT NULL REFERENCES ktp.accounts(id)   ON DELETE CASCADE,
  member_role   text        NOT NULL DEFAULT 'viewer'
                              CHECK (member_role IN ('owner', 'admin', 'editor', 'viewer')),
  invited_by    uuid        REFERENCES ktp.accounts(id) ON DELETE SET NULL,
  joined_at     timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz,
  UNIQUE (workspace_id, user_id)
);

ALTER TABLE ktp.workspace_members ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_wm_workspace ON ktp.workspace_members (workspace_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_wm_user      ON ktp.workspace_members (user_id)      WHERE deleted_at IS NULL;

-- ktp.invite_tokens
-- "token_role" avoids conflict with the SQL reserved word "role".
CREATE TABLE ktp.invite_tokens (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid        NOT NULL REFERENCES ktp.workspaces(id)  ON DELETE CASCADE,
  token         text        NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  token_role    text        NOT NULL DEFAULT 'viewer'
                              CHECK (token_role IN ('admin', 'editor', 'viewer')),
  created_by    uuid        NOT NULL REFERENCES ktp.accounts(id)    ON DELETE CASCADE,
  expires_at    timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  used_by       uuid        REFERENCES ktp.accounts(id) ON DELETE SET NULL,
  used_at       timestamptz,
  max_uses      integer     NOT NULL DEFAULT 1  CHECK (max_uses  >= 1),
  use_count     integer     NOT NULL DEFAULT 0  CHECK (use_count >= 0),
  revoked       boolean     NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ktp.invite_tokens ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_invite_token     ON ktp.invite_tokens (token);
CREATE INDEX idx_invite_workspace ON ktp.invite_tokens (workspace_id);
