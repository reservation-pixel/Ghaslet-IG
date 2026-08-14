import { cookies } from "next/headers";
import { ACCESS_COOKIE } from "@/lib/auth/cookies";
import { verifyAccessToken, type AccessClaims } from "@/lib/auth/jwt";
import { hasAtLeast, type UserRole } from "@/lib/auth/roles";

/**
 * Authenticate a route handler.
 *
 * This deliberately re-verifies the JWT rather than trusting a header set by
 * `src/proxy.ts`. The Next.js docs are explicit that proxy coverage can be
 * removed silently by a matcher change or a refactor, so authorization has to
 * be enforced at the handler too — and a trusted-header scheme would be
 * forgeable by anything that can reach the app directly, bypassing the proxy.
 */
export async function getCurrentUser(): Promise<AccessClaims | null> {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token) return null;
  return verifyAccessToken(token);
}

export class UnauthorizedError extends Error {
  constructor() {
    super("Unauthorized");
    this.name = "UnauthorizedError";
  }
}

/**
 * Returns the caller, or a 401 Response to return directly:
 *
 *   const auth = await requireUser();
 *   if (auth instanceof Response) return auth;
 */
export async function requireUser(): Promise<AccessClaims | Response> {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return user;
}

/**
 * Require at least the given role.
 *
 * Rank-based, never equality: `role === "admin"` would lock the superadmin out
 * of every admin-only route, which is the opposite of what a higher tier means.
 */
export async function requireRole(required: UserRole): Promise<AccessClaims | Response> {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasAtLeast(user.role, required)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  return user;
}

/** Admin or above — a superadmin passes. */
export function requireAdmin(): Promise<AccessClaims | Response> {
  return requireRole("admin");
}

/** Superadmin only. */
export function requireSuperAdmin(): Promise<AccessClaims | Response> {
  return requireRole("superadmin");
}
