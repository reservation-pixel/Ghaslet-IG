import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem?: number }
) => Promise<Buffer>;

/**
 * scrypt from node:crypto — a real password KDF, no native dependency.
 *
 * N=16384, r=8, p=1 is the widely used interactive-login baseline (~64 MB,
 * ~100 ms). Parameters are stored in the hash string so they can be raised
 * later without invalidating existing passwords.
 */
const PARAMS = { N: 16_384, r: 8, p: 1 };
const KEY_LEN = 64;
const SALT_LEN = 16;

// scrypt's default maxmem (32 MB) is below what N=16384,r=8 needs.
const MAXMEM = 128 * PARAMS.N * PARAMS.r * 2;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LEN);
  const derived = await scrypt(password.normalize("NFKC"), salt, KEY_LEN, {
    ...PARAMS,
    maxmem: MAXMEM,
  });

  return [
    "scrypt",
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString("base64"),
    derived.toString("base64"),
  ].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [scheme, n, r, p, saltB64, hashB64] = stored.split("$");
    if (scheme !== "scrypt") return false;

    const salt = Buffer.from(saltB64, "base64");
    const expected = Buffer.from(hashB64, "base64");

    const derived = await scrypt(password.normalize("NFKC"), salt, expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: 128 * Number(n) * Number(r) * 2,
    });

    if (derived.length !== expected.length) return false;
    return timingSafeEqual(derived, expected);
  } catch {
    // A malformed hash is a failed login, never a crash.
    return false;
  }
}

/**
 * Burn roughly the same time as a real verification when the email doesn't
 * exist, so response timing doesn't reveal which accounts are registered.
 */
export async function fakeVerify(): Promise<void> {
  await scrypt("timing-equalizer", randomBytes(SALT_LEN), KEY_LEN, {
    ...PARAMS,
    maxmem: MAXMEM,
  });
}

export function validatePasswordStrength(password: string): string | null {
  if (password.length < 12) return "Password must be at least 12 characters";
  if (password.length > 200) return "Password must be at most 200 characters";
  return null;
}
