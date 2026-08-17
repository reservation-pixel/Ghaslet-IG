import { ACCESS_TOKEN_TTL_SECONDS } from "@/lib/auth/jwt";

export const ACCESS_COOKIE = "gh_at";
export const REFRESH_COOKIE = "gh_rt";

export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

/**
 * `secure` is on except in development, where the dashboard is served over
 * plain http://localhost and a secure cookie would simply never be stored.
 */
const secure = process.env.NODE_ENV === "production";

export interface CookieSpec {
  name: string;
  value: string;
  httpOnly: true;
  secure: boolean;
  /**
   * `lax` rather than `strict`: strict would drop the cookie on any inbound
   * navigation from another site, logging the operator out whenever they click
   * a link into the dashboard. `lax` still blocks cross-site POSTs, which is
   * the CSRF case that matters here.
   */
  sameSite: "lax";
  path: string;
  maxAge: number;
}

export function accessCookie(token: string): CookieSpec {
  return {
    name: ACCESS_COOKIE,
    value: token,
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: ACCESS_TOKEN_TTL_SECONDS,
  };
}

export function refreshCookie(token: string): CookieSpec {
  return {
    name: REFRESH_COOKIE,
    value: token,
    httpOnly: true,
    secure,
    sameSite: "lax",
    // Scoped to the auth routes so the long-lived credential is not attached to
    // every dashboard request.
    path: "/api/auth",
    maxAge: REFRESH_TOKEN_TTL_SECONDS,
  };
}

export function clearedCookies(): CookieSpec[] {
  return [
    { ...accessCookie(""), maxAge: 0 },
    { ...refreshCookie(""), maxAge: 0 },
  ];
}

/**
 * The Web-standard `Response` has no cookie helper — route handlers return
 * `Response.json(...)`, so the Set-Cookie header is built by hand.
 */
export function serializeCookie(cookie: CookieSpec): string {
  const parts = [
    `${cookie.name}=${cookie.value}`,
    `Path=${cookie.path}`,
    `Max-Age=${cookie.maxAge}`,
    "SameSite=Lax",
  ];
  if (cookie.httpOnly) parts.push("HttpOnly");
  if (cookie.secure) parts.push("Secure");
  return parts.join("; ");
}

/** Append every cookie to a response's Set-Cookie headers. */
export function withCookies(response: Response, cookieList: CookieSpec[]): Response {
  for (const cookie of cookieList) {
    response.headers.append("set-cookie", serializeCookie(cookie));
  }
  return response;
}
