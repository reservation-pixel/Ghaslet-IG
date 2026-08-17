import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";

/**
 * Route protection.
 *
 * Next 16 renamed `middleware.ts` to `proxy.ts` and the function to `proxy`.
 * It runs on the Node.js runtime by default here.
 *
 * This is the first line of defence, not the only one: the Next.js docs warn
 * that a matcher change or a refactor can silently remove proxy coverage, so
 * every protected route handler independently calls `requireUser()`. Removing
 * this file would not expose the API.
 */

/** Reachable without a session. */
const PUBLIC_PATHS = new Set<string>([
  "/login",
  // Meta calls this one. It is authenticated by X-Hub-Signature-256 instead,
  // and must never require a cookie or Instagram webhooks break.
  "/api/webhook",
  "/api/auth/login",
  "/api/auth/refresh",
  "/api/auth/logout",
]);

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.has(pathname);
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(ACCESS_COOKIE)?.value;
  const claims = token ? await verifyAccessToken(token) : null;

  if (claims) {
    return NextResponse.next();
  }

  const isApi = pathname.startsWith("/api/");
  const hasRefresh = Boolean(request.cookies.get(REFRESH_COOKIE)?.value);

  // API callers get a 401 and the browser's fetch wrapper retries after
  // refreshing. Returning a redirect here would hand the caller an HTML login
  // page where it expected JSON.
  if (isApi) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // A page load with an expired access token but a live refresh token is the
  // normal case after ~15 minutes idle. Bounce through the refresh endpoint
  // and come back, rather than making the operator log in again.
  if (hasRefresh) {
    const target = new URL("/api/auth/refresh", request.url);
    target.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(target);
  }

  const login = new URL("/login", request.url);
  if (pathname !== "/") {
    login.searchParams.set("next", `${pathname}${search}`);
  }
  return NextResponse.redirect(login);
}

export const config = {
  matcher: [
    /*
     * Everything except Next internals and static assets. API routes are
     * deliberately INCLUDED — the individual public ones are allow-listed
     * above, so a new API route is protected by default rather than by
     * remembering to add it.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
