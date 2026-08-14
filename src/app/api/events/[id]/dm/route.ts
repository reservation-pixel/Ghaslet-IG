import { NextRequest } from "next/server";
import { getEvent, requeueForWorker } from "@/database/notificationRepository";
import { createLogger } from "@/lib/logger";
import { requireUser } from "@/lib/auth/guard";

const log = createLogger("api.events.dm");

export const dynamic = "force-dynamic";

/**
 * Queue a manual DM for a recorded follow or like.
 *
 * This process has no browser, so it cannot send. It re-queues the event and
 * the Playwright worker picks it up on its next cycle.
 */
export async function POST(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (auth instanceof Response) return auth;

  const { id } = await ctx.params;

  const event = await getEvent(id);
  if (!event) {
    return Response.json({ error: "Event not found" }, { status: 404 });
  }

  if (event.source !== "playwright") {
    return Response.json(
      { error: "Only Playwright-sourced events can be DMed through Instagram Web" },
      { status: 400 }
    );
  }

  if (!event.actor_username) {
    return Response.json({ error: "Event has no username to DM" }, { status: 400 });
  }

  try {
    await requeueForWorker(id);
    log.info("manual DM queued", {
      event: "manual_dm_queued",
      eventId: id,
      username: event.actor_username,
    });
    return Response.json({ status: "queued", username: event.actor_username });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}
