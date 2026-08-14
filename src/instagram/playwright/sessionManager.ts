import type { Page } from "playwright";
import { config } from "@/lib/config";
import { createLogger } from "@/lib/logger";
import { SELECTORS, anyVisible } from "@/instagram/playwright/selectors";
import { dismissPopups } from "@/instagram/playwright/popupHandler";
import { closeBrowser, getPage, sleep } from "@/instagram/playwright/browserManager";
import { recordPoll } from "@/database/automationRuleRepository";

const log = createLogger("playwright.session");

export class SessionExpiredError extends Error {
  constructor(message = "Instagram session expired — run `npm run worker:login`") {
    super(message);
    this.name = "SessionExpiredError";
  }
}

/**
 * Navigate home and decide whether the persisted profile is still authenticated.
 */
export async function isLoggedIn(page: Page): Promise<boolean> {
  await page.goto(config.instagramWebUrl, {
    waitUntil: "domcontentloaded",
    timeout: 45_000,
  });
  await dismissPopups(page);

  if (page.url().includes("/accounts/login")) return false;
  if (await anyVisible(page, SELECTORS.loginForm, 2_000)) return false;

  return anyVisible(page, SELECTORS.loggedIn, 8_000);
}

/**
 * Assert an authenticated session, recording the outcome so the dashboard can
 * show a banner. Throws `SessionExpiredError` rather than crashing the loop —
 * the scheduler catches it and pauses instead of respawning a browser forever.
 */
export async function requireSession(page: Page): Promise<void> {
  const ok = await isLoggedIn(page);

  if (!ok) {
    const message = "Instagram session expired or was never established";
    log.error(message, { event: "session_expired" });
    await recordPoll({ sessionValid: false, error: message });
    throw new SessionExpiredError();
  }

  await recordPoll({ sessionValid: true, error: null });
}

/**
 * One-time interactive login. Opens a headful browser and waits for a human to
 * complete the flow — including 2FA and any checkpoint. Everything persists to
 * the profile directory, so this is never needed again unless the session is
 * invalidated.
 */
export async function runInteractiveLogin(timeoutMs = 10 * 60_000): Promise<boolean> {
  log.info("opening browser for manual login", {
    userDataDir: config.playwrightUserDataDir,
  });

  const page = await getPage({ headless: false });

  await page.goto(`${config.instagramWebUrl}/accounts/login/`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await dismissPopups(page);

  console.log("\n  Log in to Instagram in the browser window that just opened.");
  console.log("  Complete any 2FA or security checkpoint.");
  console.log("  This window closes automatically once you reach the feed.\n");

  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    await sleep(3_000);

    try {
      await dismissPopups(page);

      const onLoginPage =
        page.url().includes("/accounts/login") ||
        (await anyVisible(page, SELECTORS.loginForm, 500));

      if (!onLoginPage && (await anyVisible(page, SELECTORS.loggedIn, 1_000))) {
        // Let Instagram finish writing its session cookies before we close.
        await sleep(3_000);
        log.info("login successful, session persisted", { event: "login_ok" });
        await recordPoll({ sessionValid: true, error: null });
        await closeBrowser();
        return true;
      }
    } catch (err) {
      log.debug("still waiting for login", { error: err });
    }
  }

  log.error("login timed out", { event: "login_timeout" });
  await recordPoll({ sessionValid: false, error: "manual login timed out" });
  await closeBrowser();
  return false;
}
