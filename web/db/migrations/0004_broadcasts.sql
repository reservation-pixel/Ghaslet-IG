-- Broadcast messaging: send a single message to all contacts who have
-- interacted with the account (followers, likers, commenters).

create table broadcasts (
  id uuid primary key default gen_random_uuid(),
  message text not null,
  status text not null default 'draft'
    check (status in ('draft', 'sending', 'paused', 'done', 'failed')),
  total_recipients int not null default 0,
  sent_count int not null default 0,
  failed_count int not null default 0,
  created_by uuid references app_users(id) on delete set null,
  created_at timestamptz default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create table broadcast_recipients (
  id uuid primary key default gen_random_uuid(),
  broadcast_id uuid not null references broadcasts(id) on delete cascade,
  actor_igsid text not null,
  actor_username text,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed', 'skipped')),
  error text,
  sent_at timestamptz,
  created_at timestamptz default now(),
  unique (broadcast_id, actor_igsid)
);

create index idx_broadcast_recipients_pending
  on broadcast_recipients (broadcast_id)
  where status = 'pending';
