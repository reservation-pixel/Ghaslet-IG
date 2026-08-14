import { requireAdmin } from "@/lib/auth/guard";
import {
  getBroadcast,
  getNextPendingBatch,
  markRecipientSent,
  markRecipientFailed,
  updateBroadcastCounts,
  setBroadcastStatus,
} from "@/database/broadcastRepository";
import { sendInstagramMessage } from "@/lib/instagram";
import { createLogger } from "@/lib/logger";

const log = createLogger("broadcast.send");

const BATCH_SIZE = 5;
const DELAY_MS = 1500;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;

  const { id } = await params;
  const broadcast = await getBroadcast(id);
  if (!broadcast) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  if (broadcast.status === "done") {
    return Response.json({ broadcast, done: true });
  }

  await setBroadcastStatus(id, "sending");

  const batch = await getNextPendingBatch(id, BATCH_SIZE);
  if (batch.length === 0) {
    const updated = await updateBroadcastCounts(id);
    return Response.json({ broadcast: updated, done: true });
  }

  for (const recipient of batch) {
    try {
      const result = await sendInstagramMessage(recipient.actor_igsid, broadcast.message);

      if (result.error) {
        log.warn("send failed", {
          recipient: recipient.actor_username,
          error: result.error,
        });
        await markRecipientFailed(
          recipient.id,
          result.error.message ?? JSON.stringify(result.error)
        );
      } else {
        log.info("sent", { recipient: recipient.actor_username });
        await markRecipientSent(recipient.id);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error("send threw", { recipient: recipient.actor_username, error: msg });
      await markRecipientFailed(recipient.id, msg);
    }

    if (batch.indexOf(recipient) < batch.length - 1) {
      await sleep(DELAY_MS);
    }
  }

  const updated = await updateBroadcastCounts(id);
  return Response.json({ broadcast: updated, done: updated?.status === "done" });
}
