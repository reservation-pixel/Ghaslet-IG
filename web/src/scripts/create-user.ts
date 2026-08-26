import { config as loadEnv } from "dotenv";
import path from "node:path";
import readline from "node:readline";
import { randomBytes } from "node:crypto";

loadEnv({ path: path.resolve(process.cwd(), ".env.local") });
loadEnv({ path: path.resolve(process.cwd(), ".env") });
loadEnv({ path: path.resolve(process.cwd(), "../.env.all") });

import { hashPassword, validatePasswordStrength } from "@/lib/auth/password";
import { USER_ROLES, isUserRole } from "@/lib/auth/roles";
import {
  countUsers,
  createUser,
  findUserByEmail,
  normalizeEmail,
  revokeAllSessions,
  setPassword,
} from "@/database/userRepository";

/**
 * Create or update a dashboard login.
 *
 *   npm run create-user
 *   npm run create-user -- --email me@example.com --name "Me" --role admin
 *   npm run create-user -- --email me@example.com --generate
 *   npm run create-user -- --email me@example.com --reset
 */

const args = process.argv.slice(2);

function flag(name: string): string | undefined {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  const next = args[i + 1];
  return next && !next.startsWith("--") ? next : undefined;
}

function has(name: string): boolean {
  return args.includes(name);
}

function die(message: string): never {
  console.error(`\n  ✗ ${message}\n`);
  process.exit(1);
}

const rl = () => readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(question: string): Promise<string> {
  const io = rl();
  return new Promise((resolve) => {
    io.question(question, (answer) => {
      io.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Read without echoing. `readline` has no built-in for this, so mute the
 * output stream while the answer is typed.
 */
function askSecret(question: string): Promise<string> {
  const io = rl();
  const output = io as unknown as { output: NodeJS.WriteStream; _writeToOutput?: unknown };

  process.stdout.write(question);
  (output as { _writeToOutput: (s: string) => void })._writeToOutput = function () {};

  return new Promise((resolve) => {
    io.question("", (answer) => {
      io.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

async function main() {
  if (!process.env.DATABASE_URL) {
    die("DATABASE_URL must be set in .env.local");
  }

  const email = flag("--email") ?? (await ask("  Email: "));
  if (!email || !email.includes("@")) die("A valid email is required");

  const existing = await findUserByEmail(email);
  const isReset = has("--reset");

  if (existing && !isReset) {
    die(`${normalizeEmail(email)} already exists. Use --reset to set a new password.`);
  }
  if (!existing && isReset) {
    die(`${normalizeEmail(email)} does not exist.`);
  }

  let password: string;
  const generated = has("--generate");

  if (generated) {
    // 24 base64url chars ≈ 143 bits. Long enough that the strength check is moot.
    password = randomBytes(18).toString("base64url");
  } else {
    password = await askSecret("  Password (min 12 chars, hidden): ");
    const confirm = await askSecret("  Confirm password: ");
    if (password !== confirm) die("Passwords do not match");

    const problem = validatePasswordStrength(password);
    if (problem) die(problem);
  }

  const passwordHash = await hashPassword(password);

  if (existing) {
    await setPassword(existing.id, passwordHash);
    // A password change must invalidate live sessions, or a stolen refresh
    // token keeps working for its full 30 days.
    await revokeAllSessions(existing.id);
    console.log(`\n  ✓ Password updated for ${existing.email}`);
    console.log("    All existing sessions were signed out.");
  } else {
    const name = flag("--name") ?? null;
    const role = flag("--role") ?? "manager";
    if (!isUserRole(role)) die(`--role must be one of: ${USER_ROLES.join(", ")}`);
    if (role === "superadmin") {
      die("Use `npm run seed:superadmin` for the superadmin — only one may exist.");
    }

    const before = await countUsers();
    const user = await createUser({ email, passwordHash, name, role });

    console.log(`\n  ✓ Created ${user.email} (${user.role})`);
    if (before === 0) console.log("    This is the first user.");
  }

  if (generated) {
    console.log(`\n  Generated password — copy it now, it is not stored anywhere:\n`);
    console.log(`    ${password}\n`);
  }

  console.log("  Sign in at /login\n");
  process.exit(0);
}

main().catch((err) => die(err instanceof Error ? err.message : String(err)));
