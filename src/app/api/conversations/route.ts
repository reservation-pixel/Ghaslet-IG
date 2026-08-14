import { query } from "@/lib/db";
import { requireUser } from "@/lib/auth/guard";
import type { ConversationWithLastMessage } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireUser();
  if (auth instanceof Response) return auth;

  try {
    // A lateral join replaces the previous N+1 (one extra query per
    // conversation to find its last message).
    const rows = await query<ConversationWithLastMessage>(
      `select c.*, m.content as last_message
         from instagram_conversations c
         left join lateral (
           select content
             from instagram_messages
            where conversation_id = c.id
            order by created_at desc
            limit 1
         ) m on true
        order by c.updated_at desc`
    );

    return Response.json(rows);
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}
