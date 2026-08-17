import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { isUserRole, type UserRole } from "@/lib/auth/roles";

/**
 * Stateless access tokens (HS256).
 *
 * Deliberately short-lived: a JWT cannot be revoked, so the revocable half of
 * the session is the refresh token in `auth_sessions`. Fifteen minutes bounds
 * how long a stolen or just-revoked token stays useful.
 */
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

const ISSUER = "ghaslet";
const AUDIENCE = "ghaslet-dashboard";

export interface AccessClaims {
  sub: string;
  email: string;
  role: UserRole;
  /** Session id, so a token can be tied back to a revocable session row. */
  sid: string;
}

let cachedKey: Uint8Array | null = null;

function secret(): Uint8Array {
  if (cachedKey) return cachedKey;

  const raw = process.env.AUTH_JWT_SECRET;
  if (!raw || raw.trim().length < 32) {
    throw new Error(
      "AUTH_JWT_SECRET must be set to at least 32 characters. Generate one with: openssl rand -base64 48"
    );
  }

  cachedKey = new TextEncoder().encode(raw.trim());
  return cachedKey;
}

export async function signAccessToken(claims: AccessClaims): Promise<string> {
  return new SignJWT({ email: claims.email, role: claims.role, sid: claims.sid })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(claims.sub)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(secret());
}

/**
 * Returns null on any failure — bad signature, expiry, wrong issuer/audience,
 * or the `alg: none` / algorithm-confusion class of attack, which jose rejects
 * because the algorithm is pinned here rather than read from the header.
 */
export async function verifyAccessToken(token: string): Promise<AccessClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ["HS256"],
    });

    return toClaims(payload);
  } catch {
    return null;
  }
}

function toClaims(payload: JWTPayload): AccessClaims | null {
  const { sub, email, role, sid } = payload as JWTPayload & Partial<AccessClaims>;
  if (!sub || !email || !sid) return null;
  // Validated against the shared role list, not a hardcoded pair — a literal
  // check here silently rejects any tier added later.
  if (!isUserRole(role)) return null;
  return { sub, email, role, sid };
}
