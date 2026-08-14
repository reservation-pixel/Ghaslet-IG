import { execute, query, queryOne, count, transaction } from "@/lib/db";
import { createLogger } from "@/lib/logger";

const log = createLogger("db.broadcasts");

export interface Broadcast {
  id: string;
  message: string;
  status: "draft" | "sending" | "paused" | "done" | "failed";
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  created_by: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface BroadcastRecipient {
  id: string;
  broadcast_id: string;
  actor_igsid: string;
  actor_username: string | null;
  status: "pending" | "sent" | "failed" | "skipped";
  error: string | null;
  sent_at: string | null;
  created_at: string;
}

export async function createBroadcast(
  message: string,
  createdBy: string
): Promise<Broadcast> {
  return transaction(async (client) => {
    const { rows: [broadcast] } = await client.query<Broadcast>(
      `insert into broadcasts (message, created_by) values ($1, $2) returning *`,
      [message, createdBy]
    );

    // Collect unique contacts from events + existing conversations.
    // Events: anyone who followed, liked, or commented.
    // Conversations: anyone who has ever DMed us.
    // Dedupe by actor_igsid.
    const { rowCount } = await client.query(
      `insert into broadcast_recipients (broadcast_id, actor_igsid, actor_username)
       select $1, igsid, username from (
         select distinct on (igsid) igsid, username from (
           select actor_igsid as igsid, actor_username as username
             from instagram_events
            where actor_igsid is not null
           union all
           select igsid, username
             from instagram_conversations
            where igsid is not null
         ) combined
         where igsid is not null
         order by igsid, username nulls last
       ) deduped`,
      [broadcast.id]
    );

    await client.query(
      `update broadcasts set total_recipients = $2 where id = $1`,
      [broadcast.id, rowCount ?? 0]
    );

    return { ...broadcast, total_recipients: rowCount ?? 0 };
  });
}

export async function getBroadcast(id: string): Promise<Broadcast | null> {
  return queryOne<Broadcast>("select * from broadcasts where id = $1", [id]);
}

export async function listBroadcasts(limit = 20): Promise<Broadcast[]> {
  return query<Broadcast>(
    "select * from broadcasts order by created_at desc limit $1",
    [limit]
  );
}

export async function getRecipients(
  broadcastId: string,
  status?: string,
  limit = 100
): Promise<BroadcastRecipient[]> {
  if (status) {
    return query<BroadcastRecipient>(
      `select * from broadcast_recipients
        where broadcast_id = $1 and status = $2
        order by created_at limit $3`,
      [broadcastId, status, limit]
    );
  }
  return query<BroadcastRecipient>(
    `select * from broadcast_recipients
      where broadcast_id = $1
      order by created_at limit $2`,
    [broadcastId, limit]
  );
}

export async function getNextPendingBatch(
  broadcastId: string,
  batchSize = 5
): Promise<BroadcastRecipient[]> {
  return query<BroadcastRecipient>(
    `select * from broadcast_recipients
      where broadcast_id = $1 and status = 'pending'
      order by created_at
      limit $2`,
    [broadcastId, batchSize]
  );
}

export async function markRecipientSent(id: string): Promise<void> {
  await execute(
    `update broadcast_recipients set status = 'sent', sent_at = now() where id = $1`,
    [id]
  );
}

export async function markRecipientFailed(id: string, error: string): Promise<void> {
  await execute(
    `update broadcast_recipients set status = 'failed', error = $2 where id = $1`,
    [id, error.slice(0, 1000)]
  );
}

export async function updateBroadcastCounts(id: string): Promise<Broadcast | null> {
  const sent = await count(
    "select count(*) from broadcast_recipients where broadcast_id = $1 and status = 'sent'",
    [id]
  );
  const failed = await count(
    "select count(*) from broadcast_recipients where broadcast_id = $1 and status = 'failed'",
    [id]
  );
  const pending = await count(
    "select count(*) from broadcast_recipients where broadcast_id = $1 and status = 'pending'",
    [id]
  );

  const isDone = pending === 0;

  if (isDone) {
    await execute(
      `update broadcasts
          set sent_count = $2, failed_count = $3, status = 'done',
              completed_at = now()
        where id = $1`,
      [id, sent, failed]
    );
  } else {
    await execute(
      `update broadcasts set sent_count = $2, failed_count = $3 where id = $1`,
      [id, sent, failed]
    );
  }

  return getBroadcast(id);
}

export async function setBroadcastStatus(
  id: string,
  status: Broadcast["status"]
): Promise<void> {
  const extra = status === "sending" ? ", started_at = coalesce(started_at, now())" : "";
  await execute(
    `update broadcasts set status = $2${extra} where id = $1`,
    [id, status]
  );
}

export async function countUniqueReachable(): Promise<number> {
  return count(
    `select count(distinct igsid) from (
       select actor_igsid as igsid from instagram_events where actor_igsid is not null
       union
       select igsid from instagram_conversations where igsid is not null
     ) combined`
  );
}
