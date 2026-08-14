import { NextRequest } from "next/server";
import { queryOne } from "@/lib/db";
import { sendInstagramMessage } from "@/lib/instagram";
import { requireUser } from "@/lib/auth/guard";
import { touchUpdatedAt } from "@/database/conversationRepository";
import type { Message } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser();
  if (auth instanceof Response) return auth;

  const { id } = await params;
  const body = await request.json();
  const { message } = body;

  if (!message?.trim()) {
    return Response.json({ error: "Message is required" }, { status: 400 });
  }

  try {
    const conversation = await queryOne<{ igsid: string }>(
      "select igsid from instagram_conversations where id = $1",
      [id]
    );

    if (!conversation) {
      return Response.json({ error: "Conversation not found" }, { status: 404 });
    }

    await sendInstagramMessage(conversation.igsid, message);

    const row = await queryOne<Message>(
      `insert into instagram_messages (conversation_id, role, content)
       values ($1, 'assistant', $2)
       returning *`,
      [id, message]
    );

    await touchUpdatedAt(id);

    return Response.json(row);
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}
