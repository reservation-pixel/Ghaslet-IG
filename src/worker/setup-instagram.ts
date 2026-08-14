import { config as loadEnv } from "dotenv";
import path from "node:path";

loadEnv({ path: path.resolve(process.cwd(), ".env.local") });
loadEnv({ path: path.resolve(process.cwd(), ".env") });

/**
 * Instagram account setup helper.
 *
 *   npm run setup:instagram -- --exchange <short-lived-token>
 *   npm run setup:instagram -- --check
 *   npm run setup:instagram -- --subscribe
 *   npm run setup:instagram -- --refresh
 *
 * Deliberately standalone: it reads process.env directly and never touches the
 * database, so it works before anything else is configured.
 */

const GRAPH = `https://graph.instagram.com/${process.env.GRAPH_API_VERSION || "v24.0"}`;
const BARE = "https://graph.instagram.com";

const args = process.argv.slice(2);

function flagValue(name: string): string | undefined {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  const next = args[i + 1];
  return next && !next.startsWith("--") ? next : undefined;
}

function die(message: string): never {
  console.error(`\n  ✗ ${message}\n`);
  process.exit(1);
}

async function call(url: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const res = await fetch(url, init);
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const err = body.error as { message?: string; code?: number } | undefined;
  if (!res.ok || err) {
    die(`${err?.message ?? `HTTP ${res.status}`}${err?.code ? ` (code ${err.code})` : ""}`);
  }
  return body;
}

function token(): string {
  return process.env.INSTAGRAM_ACCESS_TOKEN || die("INSTAGRAM_ACCESS_TOKEN is not set in .env.local");
}

/** Short-lived (1 hour) -> long-lived (60 days). */
async function exchange(shortLived: string) {
  const secret =
    process.env.META_APP_SECRET || die("META_APP_SECRET is required to exchange a token");

  const url = new URL(`${BARE}/access_token`);
  url.searchParams.set("grant_type", "ig_exchange_token");
  url.searchParams.set("client_secret", secret);
  url.searchParams.set("access_token", shortLived);

  const body = await call(url.toString());
  const days = Math.round(Number(body.expires_in ?? 0) / 86400);

  console.log("\n  ✓ Long-lived token issued");
  console.log(`    Expires in ~${days} days\n`);
  console.log("  Put this in .env.local:\n");
  console.log(`INSTAGRAM_ACCESS_TOKEN=${body.access_token}\n`);
  console.log("  Then run:  npm run setup:instagram -- --check\n");
}

/** Long-lived tokens must be refreshed before day 60 or they die. */
async function refresh() {
  const url = new URL(`${BARE}/refresh_access_token`);
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", token());

  const body = await call(url.toString());
  const days = Math.round(Number(body.expires_in ?? 0) / 86400);

  console.log("\n  ✓ Token refreshed");
  console.log(`    Expires in ~${days} days\n`);
  console.log(`INSTAGRAM_ACCESS_TOKEN=${body.access_token}\n`);
}

/** Identify the account and report which permissions the token actually carries. */
async function check() {
  const me = new URL(`${GRAPH}/me`);
  me.searchParams.set("fields", "user_id,username,account_type");
  me.searchParams.set("access_token", token());

  const profile = await call(me.toString());

  console.log("\n  ✓ Token is valid");
  console.log(`    Username     @${profile.username}`);
  console.log(`    Account type ${profile.account_type ?? "unknown"}`);
  console.log(`    user_id      ${profile.user_id}`);
  console.log(`    id           ${profile.id}\n`);
  console.log("  Put this in .env.local:\n");
  console.log(`IG_USER_ID=${profile.user_id ?? profile.id}\n`);

  const subs = new URL(`${GRAPH}/me/subscribed_apps`);
  subs.searchParams.set("access_token", token());
  const result = await call(subs.toString());
  const rows = (result.data ?? []) as { subscribed_fields?: string[] }[];
  const fields = rows[0]?.subscribed_fields ?? [];

  if (fields.length === 0) {
    console.log("  ✗ No webhook fields subscribed for this account.");
    console.log("    Run:  npm run setup:instagram -- --subscribe\n");
  } else {
    console.log(`  ✓ Subscribed fields: ${fields.join(", ")}`);
    for (const required of ["messages", "comments"]) {
      if (!fields.includes(required)) {
        console.log(`    ✗ missing "${required}" — run --subscribe`);
      }
    }
    console.log("");
  }
}

/**
 * Ticking the boxes in the App Dashboard is not enough — each account must also
 * be subscribed through the API. This is the step people miss when webhooks
 * verify fine but no events ever arrive.
 */
async function subscribe() {
  const fields = flagValue("--fields") ?? "messages,comments";

  const url = new URL(`${GRAPH}/me/subscribed_apps`);
  url.searchParams.set("subscribed_fields", fields);
  url.searchParams.set("access_token", token());

  await call(url.toString(), { method: "POST" });

  console.log(`\n  ✓ Subscribed this account to: ${fields}`);
  console.log("    Verify with:  npm run setup:instagram -- --check\n");
}

async function main() {
  const shortLived = flagValue("--exchange");

  if (args.includes("--exchange")) {
    if (!shortLived) die("--exchange needs the short-lived token as its value");
    return exchange(shortLived);
  }
  if (args.includes("--refresh")) return refresh();
  if (args.includes("--subscribe")) return subscribe();
  if (args.includes("--check")) return check();

  console.log(`
  Instagram setup helper

    --exchange <token>   Swap a 1-hour token for a 60-day one
    --check              Verify the token, print IG_USER_ID, list subscriptions
    --subscribe          Subscribe this account to the messages + comments
                         webhooks (required — the dashboard alone is not enough)
                         Optional: --fields messages,comments
    --refresh            Extend the long-lived token for another 60 days
`);
}

main().catch((err) => die(err instanceof Error ? err.message : String(err)));
