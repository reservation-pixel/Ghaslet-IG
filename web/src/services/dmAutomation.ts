import { sendInstagramMessage } from "@/lib/instagram";
import { getAIResponse } from "@/lib/ai";
import { createLogger } from "@/lib/logger";
import {
  findOrCreateByIgsid,
  getHistory,
  insertMessage,
  touchUpdatedAt,
} from "@/database/conversationRepository";

const log = createLogger("dmAutomation");

export type DmStatus =
  | "echo_ignored"
  | "non_text"
  | "no_messaging"
  | "conversation_failed"
  | "duplicate"
  | "stored_for_human"
  | "replied";

export interface MessagingEvent {
  sender?: { id?: string };
  message?: {
    mid?: string;
    text?: string;
    is_echo?: boolean;
  };
}

/**
 * Inbound Instagram DM → AI reply.
 *
 * This is a behaviour-preserving extraction of the logic that lived inline in
 * `src/app/api/webhook/route.ts`. The order of operations, the guards, and the
 * status vocabulary are unchanged — the statuses are now logged rather than
 * returned to Meta, since the handler responds before this runs.
 */
export async function handleMessagingEvent(messaging: MessagingEvent): Promise<DmStatus> {
  // Skip echo messages (sent by our own page)
  if (messaging.message?.is_echo) return "echo_ignored";

  // Only handle text messages
  if (!messaging.message?.text) return "non_text";

  const igsid = messaging.sender?.id;
  if (!igsid) return "no_messaging";

  const text = messaging.message.text;
  const instagramMsgId = messaging.message.mid;

  const conversation = await findOrCreateByIgsid(igsid);
  if (!conversation) {
    log.error("failed to create conversation", { igsid });
    return "conversation_failed";
  }

  // Store user message (ignore duplicates)
  const { isDuplicate } = await insertMessage({
    conversationId: conversation.id,
    role: "user",
    content: text,
    instagramMsgId,
  });
  if (isDuplicate) return "duplicate";

  await touchUpdatedAt(conversation.id);

  // If mode is 'human', don't auto-reply
  if (conversation.mode === "human") return "stored_for_human";

  const history = await getHistory(conversation.id, 20);
  const aiResponse = await getAIResponse(history);

  await sendInstagramMessage(igsid, aiResponse);

  await insertMessage({
    conversationId: conversation.id,
    role: "assistant",
    content: aiResponse,
  });

  await touchUpdatedAt(conversation.id);

  return "replied";
}
