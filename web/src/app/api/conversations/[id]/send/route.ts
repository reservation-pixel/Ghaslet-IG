import { NextRequest } from "next/server";
import { queryOne } from "@/lib/db";
import { requireManager } from "@/lib/auth/guard";
import { sendInstagramMessage } from "@/lib/instagram";
import { insertMessage, touchUpdatedAt } from "@/database/conversationRepository";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireManager();
  if (auth instanceof Response) return auth;

  const { id } = await params;
  const body = await request.json();
  const message = body.message?.trim();

  if (!message) {
    return Response.json({ error: "message is required" }, { status: 400 });
  }

  try {
    const convo = await queryOne<{ igsid: string }>(
      `SELECT igsid FROM instagram_conversations WHERE id = $1`,
      [id]
    );
    if (!convo) {
      return Response.json({ error: "Conversation not found" }, { status: 404 });
    }

    await sendInstagramMessage(convo.igsid, message);
    await insertMessage({ conversationId: id, role: "assistant", content: message });
    await touchUpdatedAt(id);

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}
