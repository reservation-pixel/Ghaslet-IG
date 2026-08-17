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
import type { WebDmSender } from "@/services/followAutomation";
import type { InstagramEvent } from "@/lib/types";

const log = createLogger("likeAutomation");

/**
 * New like → recorded only.
 *
 * Auto-DMing every liker is the fastest route to an action block, and likes are
 * far higher volume than follows. The DM path exists but is gated behind
 * `automation_settings.like_automation_enabled` (default false) and is normally
 * triggered by hand from the dashboard.
 */
export async function processLike(event: InstagramEvent, send?: WebDmSender): Promise<void> {
  const scoped = log.child({ eventId: event.id, username: event.actor_username });

  const settings = await getSettings();

  if (!settings.like_automation_enabled || !send) {
    await markSkipped(event.id, "like recorded, automation disabled");
    scoped.info("like recorded", { event: "recorded" });
    return;
  }

  await sendLikeDm(event, send);
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Shared by the automated path and the dashboard's manual "DM this liker"
 * button. The daily cap applies to both.
 */
export async function sendLikeDm(event: InstagramEvent, send: WebDmSender): Promise<void> {
  const scoped = log.child({ eventId: event.id, username: event.actor_username });

  if (!event.actor_username) {
    await markSkipped(event.id, "no username on like event");
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
      eventType: "like",
      username: event.actor_username,
      permalink: event.permalink,
    });

    if (!decision.dm) {
      await markSkipped(event.id, decision.skipReason ?? "rule produced no DM text");
      return;
    }

    await send(event.actor_username, decision.dm);

    await markDone(event.id, { action_taken: "web_dm", reply_text: decision.dm });
    scoped.info("liker DM sent", { event: "replied", usedAi: decision.usedAi });
  } catch (err) {
    scoped.error("like DM failed", { error: err });
    await markFailed(event.id, err, event.attempts + 1);
  }
}
