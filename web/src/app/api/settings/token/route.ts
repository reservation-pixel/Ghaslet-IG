import { NextRequest } from "next/server";
import { requireSuperAdmin } from "@/lib/auth/guard";
import { getSettings, updateSettings } from "@/database/automationRuleRepository";

export async function GET() {
  const auth = await requireSuperAdmin();
  if (auth instanceof Response) return auth;

  const settings = await getSettings();
  const token = settings.instagram_access_token;
  return Response.json({
    configured: Boolean(token),
    preview: token ? `${token.slice(0, 8)}…${token.slice(-4)}` : null,
  });
}

export async function PUT(request: NextRequest) {
  const auth = await requireSuperAdmin();
  if (auth instanceof Response) return auth;

  const body = await request.json();
  const token = typeof body.token === "string" ? body.token.trim() : null;

  await updateSettings({ instagram_access_token: token || null });

  return Response.json({
    configured: Boolean(token),
    preview: token ? `${token.slice(0, 8)}…${token.slice(-4)}` : null,
  });
}
