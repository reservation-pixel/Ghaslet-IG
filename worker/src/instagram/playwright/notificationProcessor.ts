import type { Page } from "playwright";
import { config } from "@/lib/config";
import { createLogger } from "@/lib/logger";
import { fetchNotifications } from "@/instagram/playwright/notificationWatcher";
import { parseNotifications, type ParsedNotification } from "@/instagram/playwright/notificationParser";
import { sendDmViaWeb } from "@/instagram/playwright/messageSender";
import { requireSession } from "@/instagram/playwright/sessionManager";
import {
  hasAnyPlaywrightEvents,
  insertEventIfNew,
  listPendingWebDmEvents,
} from "@/database/notificationRepository";
import { processFollow, type WebDmSender } from "@/services/followAutomation";
import { processLike, sendLikeDm } from "@/services/likeAutomation";
import type { InstagramEvent } from "@/lib/types";

const log = createLogger("playwright.processor");

export interface PollResult {
  scraped: number;
  parsed: number;
  newEvents: number;
  processed: number;
  /** Events re-queued from the dashboard and drained this cycle. */
  manual: number;
  backfilled: boolean;
}

/**
 * One poll cycle: scrape → parse → dedupe → act.
 *
 * Deliberately sequential. Two browser actions at once would fight over the
 * single page, and staggered sends look far less automated than a burst.
 */
export async function pollOnce(page: Page): Promise<PollResult> {
  await requireSession(page);

  const rows = await fetchNotifications(page);
  const notifications = parseNotifications(rows);

  // Cold-start guard: on the first ever run the notifications page is full of
  // history. Acting on it would DM everyone who has ever followed the account.
  const isFirstRun = config.backfillOnFirstRun && !(await hasAnyPlaywrightEvents());

  if (isFirstRun) {
    const seeded = await backfill(notifications);
    log.warn("first run — existing notifications recorded but not acted on", {
      event: "backfill",
      seeded,
    });
    return {
      scraped: rows.length,
      parsed: notifications.length,
      newEvents: seeded,
      processed: 0,
      manual: 0,
      backfilled: true,
    };
  }

  const send: WebDmSender = (username, text) => sendDmViaWeb(page, username, text);

  // Drain anything the dashboard re-queued before touching fresh notifications —
  // a human explicitly asked for these.
  const manual = await drainManualQueue(send);

  let newEvents = 0;
  let processed = 0;

  // Oldest first, so the DM order matches the order things actually happened.
  for (const notification of [...notifications].reverse()) {
    const event = await record(notification);
    if (!event) continue; // duplicate
    newEvents++;

    try {
      if (notification.type === "follow") {
        await processFollow(event, send);
      } else {
        await processLike(event, send);
      }
      processed++;
    } catch (err) {
      // processFollow/processLike already mark the row failed; keep polling.
      log.error("notification processing threw", {
        error: err,
        externalId: notification.externalId,
      });
    }
  }

  log.info("poll complete", {
    event: "poll_complete",
    scraped: rows.length,
    parsed: notifications.length,
    newEvents,
    processed,
    manual,
  });

  return {
    scraped: rows.length,
    parsed: notifications.length,
    newEvents,
    processed,
    manual,
    backfilled: false,
  };
}

/**
 * Send DMs for events the dashboard flipped back to `pending`.
 *
 * These bypass the per-event-type enable switch — the operator clicked the
 * button — but the daily cap inside the automation services still applies.
 */
async function drainManualQueue(send: WebDmSender): Promise<number> {
  const pending = await listPendingWebDmEvents();
  if (pending.length === 0) return 0;

  log.info("draining manually queued DMs", { event: "manual_drain", count: pending.length });

  let sent = 0;
  for (const event of pending) {
    try {
      if (event.event_type === "follow") {
        await processFollow(event, send);
      } else {
        await sendLikeDm(event, send);
      }
      sent++;
    } catch (err) {
      log.error("manual DM failed", { error: err, eventId: event.id });
    }
  }
  return sent;
}

async function record(notification: ParsedNotification): Promise<InstagramEvent | null> {
  const { event, isDuplicate } = await insertEventIfNew({
    source: "playwright",
    event_type: notification.type,
    external_id: notification.externalId,
    actor_username: notification.username,
    permalink: notification.targetHref
      ? `${config.instagramWebUrl}${notification.targetHref}`
      : null,
    content: notification.rawText,
    raw: notification,
  });

  return isDuplicate ? null : event;
}

/** Seed every currently-visible notification as already handled. */
async function backfill(notifications: ParsedNotification[]): Promise<number> {
  let seeded = 0;

  for (const notification of notifications) {
    const { isDuplicate } = await insertEventIfNew({
      source: "playwright",
      event_type: notification.type,
      external_id: notification.externalId,
      actor_username: notification.username,
      permalink: notification.targetHref
        ? `${config.instagramWebUrl}${notification.targetHref}`
        : null,
      content: notification.rawText,
      raw: notification,
      status: "skipped",
      action_taken: "none",
    });
    if (!isDuplicate) seeded++;
  }

  // A first run with zero notifications must still leave a marker, or the next
  // poll would treat itself as the first run and backfill then instead.
  if (seeded === 0) {
    await insertEventIfNew({
      source: "playwright",
      event_type: "follow",
      external_id: "__backfill_marker__",
      content: "cold-start marker — no notifications visible on first run",
      status: "skipped",
      action_taken: "none",
    });
  }

  return seeded;
}
