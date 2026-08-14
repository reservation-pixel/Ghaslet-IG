import { NextRequest } from "next/server";
import { createRule, listRules } from "@/database/automationRuleRepository";
import { normalizeKeywords } from "@/lib/keywords";
import type { EventType } from "@/lib/types";
import { requireUser } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

const EVENT_TYPES: EventType[] = ["follow", "like", "comment"];

export async function GET() {
  const auth = await requireUser();
  if (auth instanceof Response) return auth;

  try {
    return Response.json(await listRules());
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (auth instanceof Response) return auth;

  const body = await request.json();

  if (!EVENT_TYPES.includes(body.event_type)) {
    return Response.json(
      { error: `event_type must be one of ${EVENT_TYPES.join(", ")}` },
      { status: 400 }
    );
  }

  if (!body.public_reply_template && !body.dm_template && !body.use_ai) {
    return Response.json(
      { error: "A rule needs a public reply, a DM template, or use_ai enabled" },
      { status: 400 }
    );
  }

  try {
    const rule = await createRule({
      event_type: body.event_type,
      match_keywords: normalizeKeywords(body.match_keywords),
      public_reply_template: body.public_reply_template ?? null,
      dm_template: body.dm_template ?? null,
      use_ai: Boolean(body.use_ai),
      ai_instruction: body.ai_instruction ?? null,
      enabled: body.enabled ?? true,
      priority: Number(body.priority) || 0,
    });
    return Response.json(rule, { status: 201 });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}
