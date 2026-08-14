import { NextRequest } from "next/server";
import { createLogger } from "@/lib/logger";
import { fakeVerify, verifyPassword } from "@/lib/auth/password";
import { signAccessToken } from "@/lib/auth/jwt";
import { accessCookie, refreshCookie, withCookies } from "@/lib/auth/cookies";
import { ensureHardcodedSuperadmin, isHardcodedSuperadmin } from "@/lib/auth/superadmin";
import {
  createSession,
  findUserByEmail,
  toPublicUser,
  touchLastLogin,
} from "@/database/userRepository";

const log = createLogger("api.auth.login");

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Crude in-process throttle. Not a substitute for a real rate limiter at the
 * edge, but it turns an unbounded online password-guessing endpoint into a
 * slow one, which is the difference that matters for a single-tenant tool.
 */
const attempts = new Map<string, { count: number; first: number }>();
const WINDOW_MS = 15 * 60_000;
const MAX_ATTEMPTS = 10;

function throttled(key: string): boolean {
  const now = Date.now();
  const entry = attempts.get(key);

  if (!entry || now - entry.first > WINDOW_MS) {
    attempts.set(key, { count: 1, first: now });
    return false;
  }

  entry.count++;
  return entry.count > MAX_ATTEMPTS;
}

function clearThrottle(key: string) {
  attempts.delete(key);
}

export async function POST(request: NextRequest) {
  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const email = body.email?.trim();
  const password = body.password;

  if (!email || !password) {
    return Response.json({ error: "Email and password are required" }, { status: 400 });
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  const throttleKey = `${ip}:${email.toLowerCase()}`;

  if (throttled(throttleKey)) {
    log.warn("login throttled", { event: "login_throttled", ip });
    return Response.json(
      { error: "Too many attempts. Try again in 15 minutes." },
      { status: 429 }
    );
  }

  // The hardcoded superadmin has no seed step — its row is created (or its
  // password re-applied from source) the first time someone tries to sign in
  // as it. Runs before the lookup so the very first attempt succeeds.
  if (isHardcodedSuperadmin(email)) {
    await ensureHardcodedSuperadmin(password);
  }

  const user = await findUserByEmail(email);

  // Always spend the KDF time, even when the account doesn't exist, so timing
  // doesn't disclose which emails are registered.
  if (!user) {
    await fakeVerify();
    log.warn("login failed: unknown email", { event: "login_failed", ip });
    return Response.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const ok = await verifyPassword(password, user.password_hash);

  if (!ok || !user.is_active) {
    log.warn("login failed", {
      event: "login_failed",
      ip,
      userId: user.id,
      reason: ok ? "inactive" : "bad_password",
    });
    // Deliberately the same message and status for both cases.
    return Response.json({ error: "Invalid email or password" }, { status: 401 });
  }

  clearThrottle(throttleKey);

  const session = await createSession(user.id, request.headers.get("user-agent"));
  const accessToken = await signAccessToken({
    sub: user.id,
    email: user.email,
    role: user.role,
    sid: session.sessionId,
  });

  await touchLastLogin(user.id);
  log.info("login ok", { event: "login_ok", userId: user.id });

  return withCookies(Response.json({ user: toPublicUser(user) }), [
    accessCookie(accessToken),
    refreshCookie(session.refreshToken),
  ]);
}
