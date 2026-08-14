import { NextRequest } from "next/server";
import { query } from "@/lib/db";
import { requireUser } from "@/lib/auth/guard";
import type { Message } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser();
  if (auth instanceof Response) return auth;

  const { id } = await params;

  try {
    const rows = await query<Message>(
      `select * from instagram_messages
        where conversation_id = $1
        order by created_at asc`,
      [id]
    );
    return Response.json(rows);
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}
