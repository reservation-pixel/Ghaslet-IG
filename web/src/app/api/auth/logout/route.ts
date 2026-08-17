import { NextRequest } from "next/server";
import { createLogger } from "@/lib/logger";
import { REFRESH_COOKIE, clearedCookies, withCookies } from "@/lib/auth/cookies";
import { getCurrentUser } from "@/lib/auth/guard";
import { revokeAllSessions, revokeSessionByToken } from "@/database/userRepository";

const log = createLogger("api.auth.logout");

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
  const user = await getCurrentUser();

  // Revoke server-side as well as clearing cookies — clearing alone would
  // leave a stolen refresh token working for its full 30 days.
  if (refreshToken) {
    await revokeSessionByToken(refreshToken);
  }

  // "Sign out everywhere".
  const url = new URL(request.url);
  if (url.searchParams.get("all") === "true" && user) {
    await revokeAllSessions(user.sub);
    log.info("all sessions revoked", { event: "logout_all", userId: user.sub });
  }

  log.info("logout", { event: "logout", userId: user?.sub ?? null });

  return withCookies(Response.json({ ok: true }), clearedCookies());
}
