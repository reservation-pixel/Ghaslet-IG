import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { count, execute, query, queryOne, isUniqueViolation } from "@/lib/db";
import { createLogger } from "@/lib/logger";
import { REFRESH_TOKEN_TTL_SECONDS } from "@/lib/auth/cookies";
import type { UserRole } from "@/lib/auth/roles";

const log = createLogger("db.users");

export interface AppUser {
  id: string;
  email: string;
  password_hash: string;
  name: string | null;
  role: UserRole;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Safe to serialise to the browser. */
export type PublicUser = Pick<AppUser, "id" | "email" | "name" | "role">;

export function toPublicUser(user: AppUser): PublicUser {
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function findUserByEmail(email: string): Promise<AppUser | null> {
  try {
    return await queryOne<AppUser>("select * from app_users where email = $1", [
      normalizeEmail(email),
    ]);
  } catch (err) {
    log.error("findUserByEmail failed", { error: err });
    return null;
  }
}

export async function findUserById(id: string): Promise<AppUser | null> {
  try {
    return await queryOne<AppUser>("select * from app_users where id = $1", [id]);
  } catch {
    return null;
  }
}

export async function createUser(input: {
  email: string;
  passwordHash: string;
  name?: string | null;
  role?: UserRole;
}): Promise<AppUser> {
  const row = await queryOne<AppUser>(
    `insert into app_users (email, password_hash, name, role)
     values ($1, $2, $3, $4)
     returning *`,
    [normalizeEmail(input.email), input.passwordHash, input.name ?? null, input.role ?? "manager"]
  );
  if (!row) throw new Error("createUser returned no row");
  return row;
}

export async function setPassword(userId: string, passwordHash: string): Promise<void> {
  await execute("update app_users set password_hash = $1, updated_at = now() where id = $2", [
    passwordHash,
    userId,
  ]);
}

/** The single superadmin, if one has been seeded. */
export async function findSuperadmin(): Promise<AppUser | null> {
  try {
    return await queryOne<AppUser>("select * from app_users where role = 'superadmin' limit 1");
  } catch (err) {
    log.error("findSuperadmin failed", { error: err });
    return null;
  }
}

/** Promote an existing account. Fails if a superadmin already exists. */
export async function setRole(userId: string, role: UserRole): Promise<void> {
  try {
    await execute("update app_users set role = $1, updated_at = now() where id = $2", [
      role,
      userId,
    ]);
  } catch (err) {
    // pg throws on constraint violations; the old client returned them as values.
    if (isUniqueViolation(err)) {
      throw new Error("A superadmin already exists — only one is permitted.");
    }
    throw err;
  }
}

export async function countUsers(): Promise<number> {
  return count("select count(*) from app_users");
}

export type ListUser = PublicUser & { created_at: string };

export async function listUsers(): Promise<ListUser[]> {
  const rows = await query<AppUser>(
    "select * from app_users order by created_at asc"
  );
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    name: r.name,
    role: r.role,
    created_at: r.created_at,
  }));
}

export async function updateUser(
  id: string,
  patch: { name?: string; role?: UserRole }
): Promise<AppUser | null> {
  const sets: string[] = [];
  const params: unknown[] = [];

  if (patch.name !== undefined) {
    params.push(patch.name);
    sets.push(`name = $${params.length}`);
  }
  if (patch.role !== undefined) {
    params.push(patch.role);
    sets.push(`role = $${params.length}`);
  }

  if (sets.length === 0) return findUserById(id);

  params.push(id);
  return queryOne<AppUser>(
    `update app_users set ${sets.join(", ")}, updated_at = now()
     where id = $${params.length}
     returning *`,
    params
  );
}

export async function deleteUser(id: string): Promise<void> {
  await revokeAllSessions(id);
  await execute("delete from app_users where id = $1", [id]);
}

export async function touchLastLogin(userId: string): Promise<void> {
  await execute("update app_users set last_login_at = now() where id = $1", [userId]);
}

/* --------------------------------------------------------------- sessions */

/** Only the hash is stored; the plaintext lives solely in the user's cookie. */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface IssuedSession {
  sessionId: string;
  refreshToken: string;
}

export async function createSession(
  userId: string,
  userAgent: string | null
): Promise<IssuedSession> {
  const refreshToken = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000);

  const row = await queryOne<{ id: string }>(
    `insert into auth_sessions (user_id, token_hash, user_agent, expires_at)
     values ($1, $2, $3, $4)
     returning id`,
    [userId, hashToken(refreshToken), userAgent?.slice(0, 300) ?? null, expiresAt.toISOString()]
  );

  if (!row) throw new Error("createSession returned no row");
  return { sessionId: row.id, refreshToken };
}

export interface SessionLookup {
  sessionId: string;
  user: AppUser;
}

interface SessionRow {
  id: string;
  user_id: string;
  expires_at: string;
  revoked_at: string | null;
  rotated_at: string | null;
  token_hash: string;
}

/**
 * Validate a refresh token and rotate it in one step.
 *
 * Rotation makes a stolen token single-use: whoever redeems it first wins and
 * the other copy stops working. Presenting an already-rotated token is treated
 * as a compromise signal and every session for that user is revoked.
 */
export async function rotateSession(
  refreshToken: string
): Promise<{ session: SessionLookup; nextToken: string } | null> {
  const presented = hashToken(refreshToken);

  const row = await queryOne<SessionRow>(
    `select id, user_id, expires_at, revoked_at, rotated_at, token_hash
       from auth_sessions
      where token_hash = $1`,
    [presented]
  ).catch(() => null);

  if (!row) return null;

  const a = Buffer.from(row.token_hash);
  const b = Buffer.from(presented);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  if (row.revoked_at) {
    log.warn("revoked refresh token presented", {
      event: "refresh_revoked",
      userId: row.user_id,
    });
    return null;
  }

  if (row.rotated_at) {
    log.error("refresh token replay detected — revoking all sessions", {
      event: "refresh_replay",
      userId: row.user_id,
    });
    await revokeAllSessions(row.user_id);
    return null;
  }

  if (new Date(row.expires_at).getTime() < Date.now()) return null;

  const user = await findUserById(row.user_id);
  if (!user || !user.is_active) return null;

  // Consume the old token, then mint its replacement. `where rotated_at is
  // null` makes this the atomic step: two concurrent refreshes race here and
  // exactly one updates a row.
  const consumed = await execute(
    "update auth_sessions set rotated_at = now() where id = $1 and rotated_at is null",
    [row.id]
  );
  if (consumed === 0) return null;

  const next = await createSession(user.id, null);
  return { session: { sessionId: next.sessionId, user }, nextToken: next.refreshToken };
}

export async function revokeSessionByToken(refreshToken: string): Promise<void> {
  await execute("update auth_sessions set revoked_at = now() where token_hash = $1", [
    hashToken(refreshToken),
  ]);
}

export async function revokeAllSessions(userId: string): Promise<void> {
  await execute(
    "update auth_sessions set revoked_at = now() where user_id = $1 and revoked_at is null",
    [userId]
  );
}

/** Housekeeping — expired and consumed rows accumulate otherwise. */
export async function purgeExpiredSessions(): Promise<number> {
  const rows = await query<{ id: string }>(
    "delete from auth_sessions where expires_at < now() returning id"
  );
  return rows.length;
}
