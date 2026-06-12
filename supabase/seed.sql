-- seed.sql — Local development test data only.
-- DO NOT run against staging or production.
--
-- Stable test user UUIDs (referenced by all test files):
--   Alice  00000001-0000-0000-0000-000000000001  (pro plan, workspace owner)
--   Bob    00000001-0000-0000-0000-000000000002  (free,  editor in Alice's ws)
--   Carol  00000001-0000-0000-0000-000000000003  (team,  workspace owner)
--   Dave   00000001-0000-0000-0000-000000000004  (free,  no workspace)
--   Eve    00000001-0000-0000-0000-000000000005  (free,  viewer in Alice's ws)
--
-- Stable workspace UUIDs:
--   Alice's workspace  10000001-0000-0000-0000-000000000001
--   Carol's workspace  10000001-0000-0000-0000-000000000002

-- ── Step 1: seed auth.users ───────────────────────────────────────────────────
-- ktp.accounts has REFERENCES auth.users(id), so auth.users must exist first.
-- The on_auth_user_created trigger fires on each INSERT and populates ktp.accounts
-- automatically (with plan='free'). Plan corrections happen in Step 2.

INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data,
  is_super_admin,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change
) VALUES
  ('00000000-0000-0000-0000-000000000000', '00000001-0000-0000-0000-000000000001',
   'authenticated', 'authenticated', 'alice@test.local', '',
   now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"Alice"}',
   false, '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000001-0000-0000-0000-000000000002',
   'authenticated', 'authenticated', 'bob@test.local', '',
   now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"Bob"}',
   false, '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000001-0000-0000-0000-000000000003',
   'authenticated', 'authenticated', 'carol@test.local', '',
   now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"Carol"}',
   false, '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000001-0000-0000-0000-000000000004',
   'authenticated', 'authenticated', 'dave@test.local', '',
   now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"Dave"}',
   false, '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000001-0000-0000-0000-000000000005',
   'authenticated', 'authenticated', 'eve@test.local', '',
   now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"Eve"}',
   false, '', '', '', '')
ON CONFLICT (id) DO NOTHING;

-- ── Step 2: correct ktp.accounts plans ────────────────────────────────────────
-- The trigger created all accounts with plan='free'. Override where needed.
-- Using DO UPDATE to handle both fresh and idempotent runs.

INSERT INTO ktp.accounts (id, email, display_name, plan) VALUES
  ('00000001-0000-0000-0000-000000000001', 'alice@test.local',  'Alice', 'pro'),
  ('00000001-0000-0000-0000-000000000002', 'bob@test.local',    'Bob',   'free'),
  ('00000001-0000-0000-0000-000000000003', 'carol@test.local',  'Carol', 'team'),
  ('00000001-0000-0000-0000-000000000004', 'dave@test.local',   'Dave',  'free'),
  ('00000001-0000-0000-0000-000000000005', 'eve@test.local',    'Eve',   'free')
ON CONFLICT (id) DO UPDATE SET
  plan         = EXCLUDED.plan,
  email        = EXCLUDED.email,
  display_name = EXCLUDED.display_name;

-- ── Step 3: workspaces ────────────────────────────────────────────────────────
-- local_workspace_id maps Electron's DATA.workspaceId to the cloud workspace.
-- The on_workspace_created trigger seeds workspace_locks rows automatically.

INSERT INTO ktp.workspaces (id, name, owner_id, local_workspace_id, plan, max_members) VALUES
  ('10000001-0000-0000-0000-000000000001', 'Alice Workspace',
   '00000001-0000-0000-0000-000000000001', 'alice-local-ws-001', 'pro', 5)
ON CONFLICT (id) DO NOTHING;

INSERT INTO ktp.workspace_members (workspace_id, user_id, member_role, invited_by) VALUES
  ('10000001-0000-0000-0000-000000000001',
   '00000001-0000-0000-0000-000000000001', 'owner',
   '00000001-0000-0000-0000-000000000001'),
  ('10000001-0000-0000-0000-000000000001',
   '00000001-0000-0000-0000-000000000002', 'editor',
   '00000001-0000-0000-0000-000000000001'),
  ('10000001-0000-0000-0000-000000000001',
   '00000001-0000-0000-0000-000000000005', 'viewer',
   '00000001-0000-0000-0000-000000000001')
ON CONFLICT (workspace_id, user_id) DO NOTHING;

INSERT INTO ktp.workspaces (id, name, owner_id, local_workspace_id, plan, max_members) VALUES
  ('10000001-0000-0000-0000-000000000002', 'Carol Workspace',
   '00000001-0000-0000-0000-000000000003', 'carol-local-ws-001', 'team', 10)
ON CONFLICT (id) DO NOTHING;

INSERT INTO ktp.workspace_members (workspace_id, user_id, member_role, invited_by) VALUES
  ('10000001-0000-0000-0000-000000000002',
   '00000001-0000-0000-0000-000000000003', 'owner',
   '00000001-0000-0000-0000-000000000003')
ON CONFLICT (workspace_id, user_id) DO NOTHING;

-- workspace_locks rows are seeded automatically by the on_workspace_created trigger.
-- No explicit insert needed here.
