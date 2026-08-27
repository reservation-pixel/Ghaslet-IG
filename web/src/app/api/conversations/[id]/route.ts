import { NextRequest } from "next/server";
import { queryOne } from "@/lib/db";
import { requireManager } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireManager();
  if (auth instanceof Response) return auth;

  const { id } = await params;
  const body = await request.json();
  const mode = body.mode;

  if (mode !== "agent" && mode !== "human") {
    return Response.json({ error: "mode must be 'agent' or 'human'" }, { status: 400 });
  }

  try {
    const row = await queryOne(
      `UPDATE instagram_conversations SET mode = $1, updated_at = now() WHERE id = $2 RETURNING *`,
      [mode, id]
    );
    if (!row) {
      return Response.json({ error: "Conversation not found" }, { status: 404 });
    }
    return Response.json(row);
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}
