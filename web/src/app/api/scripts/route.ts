import { requireUser } from "@/lib/auth/guard";
import { getCatchAllRule, getSettings } from "@/database/automationRuleRepository";
import { INSTAGRAM_SYSTEM_PROMPT } from "@/lib/system-prompt";
import type { EventType } from "@/lib/types";

export const dynamic = "force-dynamic";

const EVENT_TYPES: EventType[] = ["follow", "like", "comment"];

export async function GET() {
  const auth = await requireUser();
  if (auth instanceof Response) return auth;

  const [follow, like, comment, settings] = await Promise.all([
    getCatchAllRule("follow"),
    getCatchAllRule("like"),
    getCatchAllRule("comment"),
    getSettings(),
  ]);

  return Response.json({
    follow: { rule: follow },
    like: { rule: like },
    comment: { rule: comment },
    dm: { systemPrompt: settings.dm_system_prompt || INSTAGRAM_SYSTEM_PROMPT },
  });
}
