-- JWT-based dashboard authentication.
--
-- Until now the dashboard was completely open: anyone who could reach the URL
-- could read every DM, send messages as the business, and rewrite automation
-- rules. These two tables back a login.

create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  -- scrypt$N$r$p$<salt-b64>$<hash-b64>. Never a plaintext or reversible value.
  password_hash text not null,
  name text,
  role text not null default 'admin' check (role in ('admin', 'agent')),
  is_active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Refresh tokens live here so a session can actually be revoked. Access tokens
-- are stateless JWTs and deliberately short-lived; the refresh token is the
-- long-lived half, and it is stored hashed so a database leak does not hand
-- over working sessions.
create table if not exists auth_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  -- sha256 of the opaque refresh token. The plaintext only ever exists in the
  -- user's cookie.
  token_hash text unique not null,
  -- Set when the token is rotated, so replay of a consumed token is detectable.
  rotated_at timestamptz,
  revoked_at timestamptz,
  user_agent text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_auth_sessions_user on auth_sessions(user_id);
create index if not exists idx_auth_sessions_expires on auth_sessions(expires_at);

-- These tables are only ever reached through the server's own pooled
-- connection; the browser never talks to Postgres directly, so there is no
-- anon role to fence off and row-level security is not used. Enabling RLS with
-- no policies would lock out the application's own role.
