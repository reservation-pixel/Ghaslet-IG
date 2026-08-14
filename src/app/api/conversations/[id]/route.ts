import { NextRequest } from "next/server";
import { queryOne } from "@/lib/db";
import { requireUser } from "@/lib/auth/guard";
import type { Conversation } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser();
  if (auth instanceof Response) return auth;

  const { id } = await params;
  const body = await request.json();

  if (body.mode && !["agent", "human"].includes(body.mode)) {
    return Response.json({ error: "Invalid mode" }, { status: 400 });
  }

  try {
    const row = await queryOne<Conversation>(
      `update instagram_conversations set mode = $2 where id = $1 returning *`,
      [id, body.mode]
    );

    if (!row) return Response.json({ error: "Conversation not found" }, { status: 404 });
    return Response.json(row);
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}
