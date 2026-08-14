import { execute, query, queryOne, isUniqueViolation } from "@/lib/db";
import { fetchInstagramProfile } from "@/lib/instagram";
import { createLogger } from "@/lib/logger";
import type { Conversation } from "@/lib/types";

const log = createLogger("db.conversations");

/**
 * Find a conversation by IGSID, creating it if absent, and refresh the cached
 * profile either way.
 *
 * The profile is deliberately re-fetched on every message because Instagram's
 * CDN picture URLs expire. That behaviour predates the Postgres port and is
 * preserved exactly.
 */
export async function findOrCreateByIgsid(igsid: string): Promise<Conversation | null> {
  try {
    const existing = await queryOne<Conversation>(
      "select * from instagram_conversations where igsid = $1",
      [igsid]
    );

    const profile = await fetchInstagramProfile(igsid);

    if (existing) {
      await execute(
        `update instagram_conversations
            set name = $2, username = $3, profile_pic = $4, follower_count = $5,
                is_user_follow_business = $6, is_business_follow_user = $7
          where id = $1`,
        [
          existing.id,
          profile.name,
          profile.username,
          profile.profile_pic,
          profile.follower_count,
          profile.is_user_follow_business,
          profile.is_business_follow_user,
        ]
      );
      return { ...existing, ...profile };
    }

    // `on conflict do nothing` + a re-read handles losing an insert race with a
    // concurrent webhook delivery.
    const created = await queryOne<Conversation>(
      `insert into instagram_conversations
         (igsid, name, username, profile_pic, follower_count,
          is_user_follow_business, is_business_follow_user)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (igsid) do nothing
       returning *`,
      [
        igsid,
        profile.name,
        profile.username,
        profile.profile_pic,
        profile.follower_count,
        profile.is_user_follow_business,
        profile.is_business_follow_user,
      ]
    );

    if (created) return created;

    return await queryOne<Conversation>(
      "select * from instagram_conversations where igsid = $1",
      [igsid]
    );
  } catch (err) {
    log.error("findOrCreateByIgsid failed", { error: err, igsid });
    return null;
  }
}

/**
 * Like `findOrCreateByIgsid`, but tolerates a Graph profile fetch that returns
 * nothing useful — used by the comment path, where the commenter may not be
 * reachable through the profile endpoint.
 */
export async function findOrCreateForActor(
  igsid: string,
  fallbackUsername: string | null
): Promise<Conversation | null> {
  const conversation = await findOrCreateByIgsid(igsid);
  if (!conversation) return null;

  if (!conversation.username && fallbackUsername) {
    await execute("update instagram_conversations set username = $2 where id = $1", [
      conversation.id,
      fallbackUsername,
    ]);
    return { ...conversation, username: fallbackUsername };
  }
  return conversation;
}

export async function touchUpdatedAt(conversationId: string): Promise<void> {
  try {
    await execute("update instagram_conversations set updated_at = now() where id = $1", [
      conversationId,
    ]);
  } catch (err) {
    log.error("touchUpdatedAt failed", { error: err, conversationId });
  }
}

export interface InsertMessageInput {
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  instagramMsgId?: string | null;
}

export interface InsertMessageResult {
  isDuplicate: boolean;
}

export async function insertMessage(input: InsertMessageInput): Promise<InsertMessageResult> {
  try {
    await execute(
      `insert into instagram_messages (conversation_id, role, content, instagram_msg_id)
       values ($1, $2, $3, $4)`,
      [input.conversationId, input.role, input.content, input.instagramMsgId ?? null]
    );
    return { isDuplicate: false };
  } catch (err) {
    // The unique index on instagram_msg_id is the duplicate-DM guard.
    if (isUniqueViolation(err)) return { isDuplicate: true };
    throw new Error(
      `insertMessage failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/** Oldest-first history window fed to the model. Matches the existing behaviour. */
export async function getHistory(
  conversationId: string,
  limit = 20
): Promise<{ role: "user" | "assistant"; content: string }[]> {
  try {
    return await query<{ role: "user" | "assistant"; content: string }>(
      `select role, content from instagram_messages
        where conversation_id = $1
        order by created_at asc
        limit $2`,
      [conversationId, limit]
    );
  } catch (err) {
    log.error("getHistory failed", { error: err, conversationId });
    return [];
  }
}
