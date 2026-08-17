import { config } from "@/lib/config";
import { createLogger } from "@/lib/logger";

const log = createLogger("meta.commentWebhook");

export interface ParsedComment {
  commentId: string;
  text: string;
  fromIgsid: string;
  fromUsername: string | null;
  mediaId: string | null;
  /** Present when the comment is a reply to another comment. */
  parentId: string | null;
  raw: unknown;
}

interface CommentChangeValue {
  id?: string;
  text?: string;
  from?: { id?: string; username?: string };
  media?: { id?: string; media_product_type?: string };
  parent_id?: string;
}

interface WebhookChange {
  field?: string;
  value?: CommentChangeValue;
}

interface WebhookEntry {
  id?: string;
  time?: number;
  changes?: WebhookChange[];
  messaging?: unknown[];
}

export interface WebhookBody {
  object?: string;
  entry?: WebhookEntry[];
}

/**
 * Extract actionable comments from a webhook body.
 *
 * Iterates *every* entry and *every* change — Meta batches events, and the
 * original handler only ever read `entry[0]`.
 *
 * Two comments are deliberately dropped here:
 *   1. Anything authored by our own account. This is the guard that stops the
 *      bot replying to its own replies forever.
 *   2. Threaded replies, unless `REPLY_TO_THREADED_COMMENTS` is on.
 */
export function parseCommentChanges(body: WebhookBody): ParsedComment[] {
  const configuredSelfId = config.igUserId;

  const parsed: ParsedComment[] = [];

  for (const entry of body.entry ?? []) {
    // `entry.id` is the account the webhook was delivered for — i.e. us. It is
    // a self-configuring self-id that works even when IG_USER_ID is unset or
    // wrong, so both are checked and either match means "our own comment".
    const selfIds = [configuredSelfId, entry.id].filter(Boolean) as string[];

    if (selfIds.length === 0) {
      log.error("no self id available — refusing to process comments", {
        event: "self_guard_unavailable",
        hint: "set IG_USER_ID; without it a reply loop is possible",
      });
      continue;
    }

    for (const change of entry.changes ?? []) {
      if (change.field !== "comments") continue;

      const value = change.value;
      if (!value?.id) continue;

      const fromId = value.from?.id;
      const text = value.text?.trim();

      if (!text) {
        log.debug("comment has no text, skipping", { commentId: value.id });
        continue;
      }

      if (!fromId) {
        log.warn("comment has no author id, skipping", { commentId: value.id });
        continue;
      }

      if (selfIds.includes(fromId)) {
        log.info("own comment, skipping", { event: "self_comment", commentId: value.id });
        continue;
      }

      // Logged at debug so the operator can confirm empirically which id space
      // `from.id` uses — comment from the business account and compare.
      log.debug("comment author", {
        commentId: value.id,
        fromId,
        entryId: entry.id,
        configuredSelfId,
      });

      if (value.parent_id && !config.replyToThreadedComments) {
        log.info("threaded reply, skipping", {
          event: "threaded_reply",
          commentId: value.id,
          parentId: value.parent_id,
        });
        continue;
      }

      parsed.push({
        commentId: value.id,
        text,
        fromIgsid: fromId,
        fromUsername: value.from?.username ?? null,
        mediaId: value.media?.id ?? null,
        parentId: value.parent_id ?? null,
        raw: change,
      });
    }
  }

  return parsed;
}

/** Collect messaging events across all entries, for the existing DM path. */
export function collectMessagingEvents(body: WebhookBody): unknown[] {
  const events: unknown[] = [];
  for (const entry of body.entry ?? []) {
    for (const messaging of entry.messaging ?? []) {
      events.push(messaging);
    }
  }
  return events;
}
