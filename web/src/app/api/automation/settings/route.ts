import { NextRequest } from "next/server";
import { getSettings, updateSettings } from "@/database/automationRuleRepository";
import type { AutomationSettings } from "@/lib/types";
import { requireUser } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireUser();
  if (auth instanceof Response) return auth;

  try {
    return Response.json(await getSettings());
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}

/** Only operator-facing switches are writable; the worker owns the rest. */
const BOOLEAN_FIELDS = [
  "use_ai",
  "follow_automation_enabled",
  "like_automation_enabled",
  "comment_automation_enabled",
] as const;

export async function PATCH(request: NextRequest) {
  const auth = await requireUser();
  if (auth instanceof Response) return auth;

  const body = await request.json();
  const patch: Partial<Omit<AutomationSettings, "id" | "updated_at">> = {};

  for (const field of BOOLEAN_FIELDS) {
    if (body[field] !== undefined) patch[field] = Boolean(body[field]);
  }

  if (body.daily_dm_cap !== undefined) {
    const cap = Number(body.daily_dm_cap);
    if (!Number.isFinite(cap) || cap < 0) {
      return Response.json({ error: "daily_dm_cap must be a non-negative number" }, { status: 400 });
    }
    patch.daily_dm_cap = Math.floor(cap);
  }

  if (Object.keys(patch).length === 0) {
    return Response.json({ error: "No writable fields in request" }, { status: 400 });
  }

  try {
    return Response.json(await updateSettings(patch));
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}
