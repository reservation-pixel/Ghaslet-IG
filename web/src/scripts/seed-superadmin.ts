import { config as loadEnv } from "dotenv";
import path from "node:path";
import { randomBytes } from "node:crypto";

loadEnv({ path: path.resolve(process.cwd(), ".env.local") });
loadEnv({ path: path.resolve(process.cwd(), ".env") });
loadEnv({ path: path.resolve(process.cwd(), "../.env.all") });

import { hashPassword, validatePasswordStrength } from "@/lib/auth/password";
import {
  createUser,
  findSuperadmin,
  findUserByEmail,
  normalizeEmail,
  revokeAllSessions,
  setPassword,
  setRole,
} from "@/database/userRepository";

/**
 * Seed the single superadmin.
 *
 *   npm run seed:superadmin
 *   npm run seed:superadmin -- --email boss@example.com --name "Boss"
 *   npm run seed:superadmin -- --rotate
 *
 * Idempotent by design: if a superadmin already exists it reports and exits 0,
 * so it is safe to run on every deploy. Exactly one superadmin can exist —
 * enforced by a partial unique index in migration 0003, not just by this check.
 */

const args = process.argv.slice(2);

function flag(name: string): string | undefined {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  const next = args[i + 1];
  return next && !next.startsWith("--") ? next : undefined;
}

function die(message: string): never {
  console.error(`\n  ✗ ${message}\n`);
  process.exit(1);
}

function generatePassword(): string {
  // 24 base64url chars ≈ 143 bits of entropy.
  return randomBytes(18).toString("base64url");
}

function report(password: string | null, email: string) {
  if (password) {
    console.log("\n  Password — copy it now, it is not stored anywhere and");
    console.log("  cannot be recovered:\n");
    console.log(`    ${password}\n`);
  }
  console.log(`  Sign in at /login as ${email}\n`);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    die("DATABASE_URL must be set in .env.local");
  }

  const rotate = args.includes("--rotate");
  const existing = await findSuperadmin();

  /* ---------------------------------------------------- already seeded ---- */

  if (existing && !rotate) {
    console.log(`\n  ✓ Superadmin already exists: ${existing.email}`);
    console.log("    Nothing to do. Use --rotate to set a new password.\n");
    process.exit(0);
  }

  if (existing && rotate) {
    const password = process.env.SUPERADMIN_PASSWORD || generatePassword();
    const generated = !process.env.SUPERADMIN_PASSWORD;

    const problem = validatePasswordStrength(password);
    if (problem) die(`SUPERADMIN_PASSWORD: ${problem}`);

    await setPassword(existing.id, await hashPassword(password));
    // A rotated password must not leave old sessions alive.
    await revokeAllSessions(existing.id);

    console.log(`\n  ✓ Rotated the password for ${existing.email}`);
    console.log("    All existing sessions were signed out.");
    report(generated ? password : null, existing.email);
    process.exit(0);
  }

  /* -------------------------------------------------------- first seed ---- */

  const email = flag("--email") ?? process.env.SUPERADMIN_EMAIL;
  if (!email || !email.includes("@")) {
    die(
      "Provide an email: --email you@example.com, or set SUPERADMIN_EMAIL in .env.local"
    );
  }

  const password = process.env.SUPERADMIN_PASSWORD || generatePassword();
  const generated = !process.env.SUPERADMIN_PASSWORD;

  const problem = validatePasswordStrength(password);
  if (problem) die(`SUPERADMIN_PASSWORD: ${problem}`);

  const name = flag("--name") ?? process.env.SUPERADMIN_NAME ?? null;
  const passwordHash = await hashPassword(password);

  // The email may already exist as an admin from `npm run create-user`.
  const byEmail = await findUserByEmail(email);

  if (byEmail) {
    await setRole(byEmail.id, "superadmin");
    await setPassword(byEmail.id, passwordHash);
    await revokeAllSessions(byEmail.id);

    console.log(`\n  ✓ Promoted ${byEmail.email} to superadmin`);
    console.log("    Its password was reset and sessions signed out.");
    report(generated ? password : null, byEmail.email);
    process.exit(0);
  }

  try {
    const user = await createUser({ email, passwordHash, name, role: "superadmin" });
    console.log(`\n  ✓ Seeded superadmin ${user.email}`);
    report(generated ? password : null, user.email);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("23505")) {
      // Lost a race, or the unique index caught a second superadmin.
      die("A superadmin already exists — only one is permitted.");
    }
    die(message);
  }

  process.exit(0);
}

main().catch((err) => die(err instanceof Error ? err.message : String(err)));
