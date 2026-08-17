import { NextRequest } from "next/server";
import { requireManager } from "@/lib/auth/guard";
import { upsertCatchAllRule, updateSettings } from "@/database/automationRuleRepository";
import type { EventType } from "@/lib/types";

const EVENT_TYPES: EventType[] = ["follow", "like", "comment"];

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  const auth = await requireManager();
  if (auth instanceof Response) return auth;

  const { type } = await params;
  const body = await request.json();

  if (type === "dm") {
    const settings = await updateSettings({
      dm_system_prompt: body.systemPrompt ?? null,
    });
    return Response.json({ systemPrompt: settings.dm_system_prompt });
  }

  if (!EVENT_TYPES.includes(type as EventType)) {
    return Response.json({ error: "Invalid type" }, { status: 400 });
  }

  const rule = await upsertCatchAllRule(type as EventType, {
    dm_template: body.dm_template ?? null,
    public_reply_template: body.public_reply_template ?? null,
    use_ai: Boolean(body.use_ai),
    ai_instruction: body.ai_instruction ?? null,
  });

  return Response.json({ rule });
}
