import { config as loadEnv } from "dotenv";
import path from "node:path";

// Next.js loads .env.local automatically; a bare Node process does not.
// This must run before anything reads process.env, so it precedes all other
// imports of our own modules.
loadEnv({ path: path.resolve(process.cwd(), ".env.local") });
loadEnv({ path: path.resolve(process.cwd(), ".env") });

import { config } from "@/lib/config";
import { assertWorkerConfig } from "@/lib/config";
import { createLogger } from "@/lib/logger";
import { closeBrowser, getPage } from "@/instagram/playwright/browserManager";
import { runInteractiveLogin, requireSession } from "@/instagram/playwright/sessionManager";
import { pollOnce } from "@/instagram/playwright/notificationProcessor";
import { startScheduler } from "@/scheduler/notificationScheduler";

const log = createLogger("worker");

const args = process.argv.slice(2);
const flags = {
  login: args.includes("--login"),
  once: args.includes("--once"),
  dryRun: args.includes("--dry-run"),
};

// A --dry-run flag is just a nicer way to set the env var.
if (flags.dryRun) process.env.DRY_RUN = "true";

async function main() {
  assertWorkerConfig();

  if (flags.login) {
    const ok = await runInteractiveLogin();
    process.exit(ok ? 0 : 1);
  }

  log.info("worker starting", {
    dryRun: config.dryRun,
    headless: config.playwrightHeadless,
    intervalMs: config.pollIntervalMs,
    userDataDir: config.playwrightUserDataDir,
    mode: flags.once ? "once" : "loop",
  });

  const page = await getPage();

  // Fail fast with an actionable message instead of a wall of Playwright errors.
  try {
    await requireSession(page);
  } catch {
    log.error("no valid Instagram session", {
      event: "session_expired",
      hint: "run `npm run worker:login` and complete the login manually",
    });
    await closeBrowser();
    process.exit(1);
  }

  if (flags.once) {
    const result = await pollOnce(page);
    log.info("single poll finished", { ...result });
    await closeBrowser();
    process.exit(0);
  }

  const scheduler = startScheduler({ page });

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;

    log.info("shutting down", { signal });
    scheduler.stop();

    // Let the in-flight cycle finish so we never abandon a half-sent DM.
    await Promise.race([
      scheduler.drain(),
      new Promise((resolve) => setTimeout(resolve, 30_000)),
    ]);

    await closeBrowser();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch(async (err) => {
  log.error("worker crashed", { error: err });
  await closeBrowser();
  process.exit(1);
});
