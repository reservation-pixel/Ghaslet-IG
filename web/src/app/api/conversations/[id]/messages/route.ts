import { NextRequest } from "next/server";
import { query } from "@/lib/db";
import { requireUser } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser();
  if (auth instanceof Response) return auth;

  const { id } = await params;

  try {
    const rows = await query(
      `SELECT id, conversation_id, role, content, instagram_msg_id, created_at
       FROM instagram_messages
       WHERE conversation_id = $1
       ORDER BY created_at ASC`,
      [id]
    );
    return Response.json(rows);
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}
