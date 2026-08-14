import { replyToComment, sendPrivateReply } from "@/instagram/meta/comments";
import type { ParsedComment } from "@/instagram/meta/commentWebhook";
import { decide } from "@/services/automationEngine";
import { createLogger } from "@/lib/logger";
import {
  insertEventIfNew,
  markDone,
  markFailed,
  markProcessing,
  markSkipped,
} from "@/database/notificationRepository";
import {
  findOrCreateForActor,
  insertMessage,
  touchUpdatedAt,
} from "@/database/conversationRepository";
import type { ActionTaken } from "@/lib/types";

const log = createLogger("commentAutomation");

/**
 * Comment → public reply + private DM.
 *
 * Duplicate protection is the `unique (event_type, external_id)` constraint on
 * `instagram_events`, keyed on Meta's comment id. A webhook retry therefore
 * never produces a second reply.
 */
export async function processComment(comment: ParsedComment): Promise<void> {
  const scoped = log.child({ commentId: comment.commentId, username: comment.fromUsername });

  const { event, isDuplicate } = await insertEventIfNew({
    source: "meta",
    event_type: "comment",
    external_id: comment.commentId,
    actor_username: comment.fromUsername,
    actor_igsid: comment.fromIgsid,
    media_id: comment.mediaId,
    content: comment.text,
    raw: comment.raw,
  });

  if (isDuplicate || !event) {
    scoped.info("comment already processed", { event: "duplicate" });
    return;
  }

  await markProcessing(event.id);

  try {
    const decision = await decide({
      eventType: "comment",
      username: comment.fromUsername,
      text: comment.text,
    });

    if (!decision.publicReply && !decision.dm) {
      scoped.info("no action for comment", {
        event: "skipped",
        reason: decision.skipReason ?? "rule produced no text",
      });
      await markSkipped(event.id, decision.skipReason ?? "rule produced no text");
      return;
    }

    const actions: ActionTaken[] = [];

    // Public reply first — it is the lower-risk half. A failure on the private
    // reply below must not undo it, so they are reported independently.
    if (decision.publicReply) {
      await replyToComment(comment.commentId, decision.publicReply);
      actions.push("public_reply");
    }

    let conversationId: string | null = null;

    if (decision.dm) {
      try {
        await sendPrivateReply(comment.commentId, decision.dm);
        actions.push("private_dm");

        // Mirror the DM into the existing inbox so it shows up in the dashboard
        // alongside ordinary conversations.
        const conversation = await findOrCreateForActor(comment.fromIgsid, comment.fromUsername);
        if (conversation) {
          conversationId = conversation.id;
          await insertMessage({
            conversationId: conversation.id,
            role: "assistant",
            content: decision.dm,
          });
          await touchUpdatedAt(conversation.id);
        }
      } catch (err) {
        scoped.error("private reply failed", { error: err, publicReplySent: actions.length > 0 });
        if (actions.length === 0) throw err; // nothing succeeded — surface it
      }
    }

    await markDone(event.id, {
      action_taken: actions.includes("private_dm") ? "private_dm" : "public_reply",
      reply_text: decision.dm ?? decision.publicReply,
      conversation_id: conversationId,
    });

    scoped.info("comment processed", {
      event: "replied",
      actions,
      usedAi: decision.usedAi,
      ruleId: decision.ruleId,
    });
  } catch (err) {
    scoped.error("comment processing failed", { error: err });
    await markFailed(event.id, err, event.attempts + 1);
  }
}
