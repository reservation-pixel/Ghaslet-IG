import { decide } from "@/services/automationEngine";
import { createLogger } from "@/lib/logger";
import {
  countDmsSince,
  markDone,
  markFailed,
  markProcessing,
  markSkipped,
} from "@/database/notificationRepository";
import { getSettings } from "@/database/automationRuleRepository";
import type { InstagramEvent } from "@/lib/types";

const log = createLogger("followAutomation");

/**
 * Injected by the worker. Kept as a narrow interface so this module — which the
 * Next.js server also imports — never pulls Playwright into the web bundle.
 */
export type WebDmSender = (username: string, text: string) => Promise<void>;

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * New follower → DM through Instagram Web.
 *
 * The Graph API cannot reach a user who has never messaged the account, which
 * is the entire reason this path goes through the browser.
 */
export async function processFollow(event: InstagramEvent, send: WebDmSender): Promise<void> {
  const scoped = log.child({ eventId: event.id, username: event.actor_username });

  if (!event.actor_username) {
    await markSkipped(event.id, "no username on follow event");
    return;
  }

  await markProcessing(event.id);

  try {
    const settings = await getSettings();
    const sentToday = await countDmsSince(startOfToday());

    if (sentToday >= settings.daily_dm_cap) {
      scoped.warn("daily DM cap reached, skipping", {
        event: "cap_reached",
        sentToday,
        cap: settings.daily_dm_cap,
      });
      await markSkipped(event.id, `daily DM cap of ${settings.daily_dm_cap} reached`);
      return;
    }

    const decision = await decide({
      eventType: "follow",
      username: event.actor_username,
    });

    if (!decision.dm) {
      scoped.info("no DM for follow", {
        event: "skipped",
        reason: decision.skipReason ?? "rule produced no DM text",
      });
      await markSkipped(event.id, decision.skipReason ?? "rule produced no DM text");
      return;
    }

    await send(event.actor_username, decision.dm);

    await markDone(event.id, { action_taken: "web_dm", reply_text: decision.dm });
    scoped.info("follower DM sent", {
      event: "replied",
      usedAi: decision.usedAi,
      ruleId: decision.ruleId,
    });
  } catch (err) {
    scoped.error("follow processing failed", { error: err });
    await markFailed(event.id, err, event.attempts + 1);
  }
}
