-- Conversations and messages.
--
-- These tables predate the migration files: they were applied directly through
-- the Supabase MCP server and only ever recorded in `claude_code_prompt.md`.
-- Recreated here so a fresh Postgres can be built from the repo alone.

create extension if not exists pgcrypto;

create table if not exists instagram_conversations (
  id uuid primary key default gen_random_uuid(),
  igsid text unique not null,
  name text,
  username text,
  profile_pic text,
  follower_count integer,
  is_user_follow_business boolean,
  is_business_follow_user boolean,
  mode text not null default 'agent' check (mode in ('agent', 'human')),
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);

create table if not exists instagram_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references instagram_conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  -- Unique, and the whole duplicate-webhook defence for inbound DMs. Outbound
  -- rows leave it null, and Postgres permits unlimited nulls in a unique index.
  instagram_msg_id text unique,
  created_at timestamptz default now()
);

create index if not exists idx_instagram_messages_conversation
  on instagram_messages(conversation_id);

create index if not exists idx_instagram_conversations_updated
  on instagram_conversations(updated_at desc);
