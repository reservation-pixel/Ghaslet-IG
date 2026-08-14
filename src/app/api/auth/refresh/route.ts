import { NextRequest } from "next/server";
import { createLogger } from "@/lib/logger";
import { signAccessToken } from "@/lib/auth/jwt";
import {
  REFRESH_COOKIE,
  accessCookie,
  clearedCookies,
  refreshCookie,
  withCookies,
} from "@/lib/auth/cookies";
import { rotateSession, toPublicUser } from "@/database/userRepository";

const log = createLogger("api.auth.refresh");

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Exchange a refresh token for a fresh access token, rotating the refresh
 * token in the process.
 *
 * Two callers:
 *   - the browser's fetch wrapper, after a 401 (returns JSON)
 *   - `src/proxy.ts`, which redirects page loads here when the access token has
 *     expired but a refresh cookie is still present (returns a 302 to `next`)
 */
async function handle(request: NextRequest) {
  const nextPath = safeNext(request.nextUrl.searchParams.get("next"));
  const presented = request.cookies.get(REFRESH_COOKIE)?.value;

  if (!presented) {
    return fail(nextPath, "no refresh token");
  }

  const rotated = await rotateSession(presented);

  if (!rotated) {
    log.warn("refresh rejected", { event: "refresh_failed" });
    return fail(nextPath, "invalid refresh token");
  }

  const { session, nextToken } = rotated;
  const accessToken = await signAccessToken({
    sub: session.user.id,
    email: session.user.email,
    role: session.user.role,
    sid: session.sessionId,
  });

  const cookieList = [accessCookie(accessToken), refreshCookie(nextToken)];

  if (nextPath) {
    return withCookies(
      new Response(null, { status: 302, headers: { location: nextPath } }),
      cookieList
    );
  }

  return withCookies(Response.json({ user: toPublicUser(session.user) }), cookieList);
}

/**
 * A failed refresh must clear both cookies, otherwise the proxy sees a refresh
 * cookie, redirects here, fails again, and the browser loops.
 */
function fail(nextPath: string | null, reason: string) {
  if (nextPath) {
    const location = `/login?next=${encodeURIComponent(nextPath)}`;
    return withCookies(
      new Response(null, { status: 302, headers: { location } }),
      clearedCookies()
    );
  }
  return withCookies(Response.json({ error: reason }, { status: 401 }), clearedCookies());
}

/** Only same-origin absolute paths — never an attacker-supplied external URL. */
function safeNext(value: string | null): string | null {
  if (!value) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

export const GET = handle;
export const POST = handle;
