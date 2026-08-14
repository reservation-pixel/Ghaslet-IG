import { NextRequest, after } from "next/server";
import { config } from "@/lib/config";
import { createLogger } from "@/lib/logger";
import { verifySignature } from "@/instagram/meta/signature";
import {
  collectMessagingEvents,
  parseCommentChanges,
  type WebhookBody,
} from "@/instagram/meta/commentWebhook";
import { handleMessagingEvent, type MessagingEvent } from "@/services/dmAutomation";
import { processComment } from "@/services/commentAutomation";

const log = createLogger("webhook");

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.INSTAGRAM_VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 });
  }

  return new Response("Forbidden", { status: 403 });
}

export async function POST(request: NextRequest) {
  // The raw bytes are required for the HMAC — re-serialising a parsed body
  // produces a different string and the signature would never match.
  const raw = await request.text();

  const appSecret = config.metaAppSecret;
  if (appSecret) {
    const signature = request.headers.get("x-hub-signature-256");
    if (!verifySignature(raw, signature, appSecret)) {
      log.warn("rejected webhook with invalid signature", { event: "bad_signature" });
      return Response.json({ status: "invalid_signature" }, { status: 401 });
    }
  } else {
    log.warn("META_APP_SECRET is not set — accepting unverified webhook", {
      event: "signature_check_skipped",
    });
  }

  let body: WebhookBody;
  try {
    body = JSON.parse(raw) as WebhookBody;
  } catch {
    return Response.json({ status: "invalid_json" }, { status: 400 });
  }

  if (body.object !== "instagram") {
    return Response.json({ status: "ignored" });
  }

  const messagingEvents = collectMessagingEvents(body);
  const comments = parseCommentChanges(body);

  if (messagingEvents.length === 0 && comments.length === 0) {
    return Response.json({ status: "no_events" });
  }

  // Meta retries anything it doesn't get a 200 for within ~5 seconds, and the
  // work below routinely exceeds that (Graph calls + an LLM round-trip). Ack
  // first, process after the response is flushed.
  after(async () => {
    for (const messaging of messagingEvents) {
      try {
        const status = await handleMessagingEvent(messaging as MessagingEvent);
        log.info("dm handled", { event: status });
      } catch (error) {
        log.error("dm handling failed", { error });
      }
    }

    for (const comment of comments) {
      try {
        await processComment(comment);
      } catch (error) {
        log.error("comment handling failed", { error, commentId: comment.commentId });
      }
    }
  });

  return Response.json({
    status: "accepted",
    messaging: messagingEvents.length,
    comments: comments.length,
  });
}
