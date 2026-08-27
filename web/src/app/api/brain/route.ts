import { NextRequest } from "next/server";
import { getSettings, updateSettings } from "@/database/automationRuleRepository";
import { INSTAGRAM_SYSTEM_PROMPT } from "@/lib/system-prompt";
import { requireUser, requireManager } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireUser();
  if (auth instanceof Response) return auth;

  try {
    const settings = await getSettings();
    return Response.json({
      systemPrompt: settings.dm_system_prompt || INSTAGRAM_SYSTEM_PROMPT,
    });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireManager();
  if (auth instanceof Response) return auth;

  try {
    const body = await request.json();
    const value = body.systemPrompt === null ? null : String(body.systemPrompt);
    await updateSettings({ dm_system_prompt: value });
    const settings = await getSettings();
    return Response.json({
      systemPrompt: settings.dm_system_prompt || INSTAGRAM_SYSTEM_PROMPT,
    });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}
