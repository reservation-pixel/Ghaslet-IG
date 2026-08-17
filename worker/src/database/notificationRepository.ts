import { count, execute, query, queryOne, isUniqueViolation } from "@/lib/db";
import { createLogger } from "@/lib/logger";
import type {
  ActionTaken,
  EventSource,
  EventType,
  InstagramEvent,
} from "@/lib/types";

const log = createLogger("db.events");

export interface NewEvent {
  source: EventSource;
  event_type: EventType;
  external_id: string;
  actor_username?: string | null;
  actor_igsid?: string | null;
  media_id?: string | null;
  permalink?: string | null;
  content?: string | null;
  raw?: unknown;
  /** Defaults to 'pending'. Backfilled events are inserted straight as 'skipped'. */
  status?: InstagramEvent["status"];
  action_taken?: ActionTaken | null;
}

export interface InsertResult {
  event: InstagramEvent | null;
  isDuplicate: boolean;
}

/**
 * Insert an event, relying on `unique (event_type, external_id)` for duplicate
 * protection. This is the single dedupe mechanism for both the Meta webhook and
 * the Playwright poller.
 *
 * `on conflict do nothing` returns no row on a duplicate, which avoids the
 * try/catch that a raised unique violation would otherwise need.
 */
export async function insertEventIfNew(input: NewEvent): Promise<InsertResult> {
  try {
    const row = await queryOne<InstagramEvent>(
      `insert into instagram_events
         (source, event_type, external_id, actor_username, actor_igsid,
          media_id, permalink, content, raw, status, action_taken)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       on conflict (event_type, external_id) do nothing
       returning *`,
      [
        input.source,
        input.event_type,
        input.external_id,
        input.actor_username ?? null,
        input.actor_igsid ?? null,
        input.media_id ?? null,
        input.permalink ?? null,
        input.content ?? null,
        input.raw === undefined ? null : JSON.stringify(input.raw),
        input.status ?? "pending",
        input.action_taken ?? null,
      ]
    );

    if (!row) {
      log.info("duplicate event ignored", {
        event: "duplicate",
        event_type: input.event_type,
        external_id: input.external_id,
      });
      return { event: null, isDuplicate: true };
    }

    return { event: row, isDuplicate: false };
  } catch (err) {
    if (isUniqueViolation(err)) return { event: null, isDuplicate: true };
    log.error("failed to insert event", { error: err, external_id: input.external_id });
    throw new Error(
      `insertEventIfNew failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

export async function markProcessing(id: string): Promise<void> {
  try {
    await execute("update instagram_events set status = 'processing' where id = $1", [id]);
  } catch (err) {
    log.error("markProcessing failed", { error: err, id });
  }
}

export async function markDone(
  id: string,
  fields: { action_taken: ActionTaken; reply_text?: string | null; conversation_id?: string | null }
): Promise<void> {
  try {
    await execute(
      `update instagram_events
          set status = 'done',
              action_taken = $2,
              reply_text = $3,
              conversation_id = $4,
              processed_at = now(),
              error = null
        where id = $1`,
      [id, fields.action_taken, fields.reply_text ?? null, fields.conversation_id ?? null]
    );
  } catch (err) {
    log.error("markDone failed", { error: err, id });
  }
}

export async function markSkipped(id: string, reason: string): Promise<void> {
  try {
    await execute(
      `update instagram_events
          set status = 'skipped', action_taken = 'none', error = $2, processed_at = now()
        where id = $1`,
      [id, reason]
    );
  } catch (err) {
    log.error("markSkipped failed", { error: err, id });
  }
}

export async function markFailed(id: string, err: unknown, attempts: number): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  try {
    await execute(
      `update instagram_events
          set status = 'failed', error = $2, attempts = $3, processed_at = now()
        where id = $1`,
      [id, message.slice(0, 1000), attempts]
    );
  } catch (e) {
    log.error("markFailed failed", { error: e, id });
  }
}

export interface ListEventsFilter {
  eventType?: EventType;
  source?: EventSource;
  status?: InstagramEvent["status"];
  limit?: number;
}

export async function listEvents(filter: ListEventsFilter = {}): Promise<InstagramEvent[]> {
  const where: string[] = [];
  const params: unknown[] = [];

  if (filter.eventType) {
    params.push(filter.eventType);
    where.push(`event_type = $${params.length}`);
  }
  if (filter.source) {
    params.push(filter.source);
    where.push(`source = $${params.length}`);
  }
  if (filter.status) {
    params.push(filter.status);
    where.push(`status = $${params.length}`);
  }

  params.push(filter.limit ?? 100);

  return query<InstagramEvent>(
    `select * from instagram_events
     ${where.length ? `where ${where.join(" and ")}` : ""}
     order by created_at desc
     limit $${params.length}`,
    params
  );
}

export async function getEvent(id: string): Promise<InstagramEvent | null> {
  try {
    return await queryOne<InstagramEvent>("select * from instagram_events where id = $1", [id]);
  } catch {
    return null;
  }
}

/**
 * Re-queue an event for the worker.
 *
 * The Next.js process has no browser, so the dashboard's "Send DM" button
 * cannot send anything itself — it flips the row back to pending and the worker
 * picks it up on its next cycle.
 */
export async function requeueForWorker(id: string): Promise<void> {
  await execute(
    `update instagram_events
        set status = 'pending', action_taken = null, error = null, processed_at = null
      where id = $1`,
    [id]
  );
}

/** Events waiting on a browser action — includes anything re-queued by hand. */
export async function listPendingWebDmEvents(limit = 20): Promise<InstagramEvent[]> {
  try {
    return await query<InstagramEvent>(
      `select * from instagram_events
        where source = 'playwright'
          and status = 'pending'
          and event_type in ('follow', 'like')
        order by created_at asc
        limit $1`,
      [limit]
    );
  } catch (err) {
    log.error("listPendingWebDmEvents failed", { error: err });
    return [];
  }
}

/**
 * How many DMs have actually been sent since `since`. Backs the daily cap, and
 * counts both Graph private replies and Instagram-Web DMs.
 */
export async function countDmsSince(since: Date): Promise<number> {
  try {
    return await count(
      `select count(*) from instagram_events
        where action_taken in ('private_dm', 'web_dm')
          and status = 'done'
          and processed_at >= $1`,
      [since.toISOString()]
    );
  } catch (err) {
    log.error("countDmsSince failed", { error: err });
    // Fail closed: report the cap as reached rather than risk a send spree.
    return Number.MAX_SAFE_INTEGER;
  }
}

/**
 * Cold-start guard. If the worker has never recorded a Playwright event, the
 * notifications page is full of history and acting on it would DM everyone who
 * has ever followed the account.
 */
export async function hasAnyPlaywrightEvents(): Promise<boolean> {
  try {
    const n = await count("select count(*) from instagram_events where source = 'playwright'");
    return n > 0;
  } catch (err) {
    log.error("hasAnyPlaywrightEvents failed", { error: err });
    // Fail safe: pretend there is history so the caller does NOT treat this as
    // a first run and start sending.
    return true;
  }
}
