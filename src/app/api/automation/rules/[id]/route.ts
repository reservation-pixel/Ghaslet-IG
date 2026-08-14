import { NextRequest } from "next/server";
import { deleteRule, updateRule, type RuleInput } from "@/database/automationRuleRepository";
import { normalizeKeywords } from "@/lib/keywords";
import { requireUser } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (auth instanceof Response) return auth;

  const { id } = await ctx.params;
  const body = await request.json();

  const patch: RuleInput = {};
  if (body.event_type !== undefined) patch.event_type = body.event_type;
  if (body.match_keywords !== undefined) {
    patch.match_keywords = normalizeKeywords(body.match_keywords);
  }
  if (body.public_reply_template !== undefined) {
    patch.public_reply_template = body.public_reply_template || null;
  }
  if (body.dm_template !== undefined) patch.dm_template = body.dm_template || null;
  if (body.use_ai !== undefined) patch.use_ai = Boolean(body.use_ai);
  if (body.ai_instruction !== undefined) patch.ai_instruction = body.ai_instruction || null;
  if (body.enabled !== undefined) patch.enabled = Boolean(body.enabled);
  if (body.priority !== undefined) patch.priority = Number(body.priority) || 0;

  try {
    return Response.json(await updateRule(id, patch));
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (auth instanceof Response) return auth;

  const { id } = await ctx.params;

  try {
    await deleteRule(id);
    return Response.json({ status: "deleted" });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}
