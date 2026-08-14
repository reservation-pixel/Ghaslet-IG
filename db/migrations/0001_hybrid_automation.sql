-- gen_random_uuid() is built in from PG13; pgcrypto covers older servers.
create extension if not exists pgcrypto;

-- Hybrid Instagram automation: events, rules, settings.
--
-- Apply with `npm run db:migrate`.
--
-- Existing tables (instagram_conversations, instagram_messages) are untouched.

-- ---------------------------------------------------------------------------
-- Events: every follow, like and comment, from either source.
-- ---------------------------------------------------------------------------
create table if not exists instagram_events (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('meta', 'playwright')),
  event_type text not null check (event_type in ('follow', 'like', 'comment')),

  -- Dedupe key. Meta comment id, or a synthesised fingerprint for Playwright:
  --   follow:<username>
  --   like:<username>:<target_href>
  -- Deliberately excludes relative timestamps, which mutate between polls.
  external_id text not null,

  actor_username text,
  actor_igsid text,
  media_id text,
  permalink text,
  content text,
  raw jsonb,

  status text not null default 'pending'
    check (status in ('pending', 'processing', 'done', 'skipped', 'failed')),
  action_taken text check (action_taken in ('public_reply', 'private_dm', 'web_dm', 'none')),
  reply_text text,
  error text,
  attempts int not null default 0,

  conversation_id uuid references instagram_conversations(id) on delete set null,

  created_at timestamptz not null default now(),
  processed_at timestamptz,

  -- The single duplicate-protection guarantee for both webhook retries and
  -- repeated notification scrapes.
  unique (event_type, external_id)
);

create index if not exists idx_instagram_events_created
  on instagram_events (created_at desc);

create index if not exists idx_instagram_events_pending
  on instagram_events (source, status)
  where status = 'pending';

-- ---------------------------------------------------------------------------
-- Rules: templates, keywords and per-rule AI instructions.
-- ---------------------------------------------------------------------------
create table if not exists automation_rules (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in ('follow', 'like', 'comment')),

  -- null or empty = catch-all
  match_keywords text[],

  public_reply_template text,
  dm_template text,
  use_ai boolean not null default false,
  ai_instruction text,

  enabled boolean not null default true,
  priority int not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_automation_rules_lookup
  on automation_rules (event_type, enabled, priority desc);

-- ---------------------------------------------------------------------------
-- Settings: single-row global switches plus the worker heartbeat.
-- ---------------------------------------------------------------------------
create table if not exists automation_settings (
  id int primary key default 1 check (id = 1),

  use_ai boolean not null default true,
  follow_automation_enabled boolean not null default true,
  like_automation_enabled boolean not null default false,
  comment_automation_enabled boolean not null default true,
  daily_dm_cap int not null default 40,

  playwright_session_valid boolean not null default false,
  playwright_last_poll_at timestamptz,
  playwright_last_error text,

  updated_at timestamptz not null default now()
);

insert into automation_settings (id) values (1) on conflict (id) do nothing;

-- (A Supabase Realtime publication used to be declared here. On plain
-- Postgres there is no such publication and the dashboard polls instead.)

-- ---------------------------------------------------------------------------
-- Starter rules. Edit or delete these from the /automation dashboard.
-- ---------------------------------------------------------------------------
insert into automation_rules
  (event_type, match_keywords, public_reply_template, dm_template, use_ai, ai_instruction, priority)
values
  (
    'comment',
    array['price', 'cost', 'how much', 'link', 'info'],
    'Just sent you the details in a DM, {{username}}! 💜',
    'Hey {{username}}! Thanks for asking — happy to share the details. What are you most interested in?',
    false,
    null,
    100
  ),
  (
    'comment',
    null,
    'Thanks for the comment, {{username}}! 🙌',
    'Hey {{username}}, thanks for engaging with our post! Anything we can help you with?',
    false,
    null,
    0
  ),
  (
    'follow',
    null,
    null,
    'Hey {{username}}, thanks so much for the follow! Let us know if there is anything we can help you with 💜',
    false,
    null,
    0
  )
on conflict do nothing;
