import type { Page } from "playwright";
import { config } from "@/lib/config";
import { createLogger } from "@/lib/logger";
import { openDmThread } from "@/instagram/playwright/profileNavigator";
import { humanDelay, sleep } from "@/instagram/playwright/browserManager";
import { SELECTORS, firstVisible } from "@/instagram/playwright/selectors";

const log = createLogger("playwright.sender");

/** Instagram truncates long DMs; keep well inside the limit. */
const MAX_DM_LENGTH = 950;

export class DmSendError extends Error {
  constructor(username: string, reason: string) {
    super(`Failed to DM @${username}: ${reason}`);
    this.name = "DmSendError";
  }
}

/**
 * Send a DM through Instagram Web.
 *
 * This exists because the Graph API cannot message a user who has not messaged
 * the account first — a brand new follower is unreachable any other way.
 */
export async function sendDmViaWeb(page: Page, username: string, text: string): Promise<void> {
  const body = text.trim().slice(0, MAX_DM_LENGTH);
  if (!body) throw new DmSendError(username, "empty message");

  if (config.dryRun) {
    log.info("DRY_RUN: skipping web DM", { event: "dry_run", username, text: body });
    return;
  }

  // Look less like a bot: pause before touching the UI at all.
  await humanDelay();

  const composer = await openDmThread(page, username);

  await composer.click({ timeout: 10_000 });
  await sleep(500);

  // Type character-by-character rather than pasting — Instagram's composer is a
  // contenteditable that ignores programmatic value assignment, and per-key
  // input also reads as human.
  await page.keyboard.type(body, { delay: 30 + Math.random() * 40 });
  await sleep(800);

  await page.keyboard.press("Enter");
  await sleep(2_000);

  if (!(await verifySent(page, body))) {
    // Enter sometimes only inserts a newline; fall back to the Send control.
    const sendButton = await firstVisible(page, SELECTORS.sendButton, 3_000);
    if (sendButton) {
      await sendButton.click({ timeout: 5_000 }).catch(() => {});
      await sleep(2_000);
    }

    if (!(await verifySent(page, body))) {
      throw new DmSendError(username, "message did not appear in the thread after sending");
    }
  }

  log.info("web DM sent", { event: "web_dm", username, length: body.length });
}

/**
 * Confirm the message actually landed. Without this a failed send is
 * indistinguishable from a successful one and the event gets marked done.
 */
async function verifySent(page: Page, body: string): Promise<boolean> {
  // Match on a distinctive slice: the full text may be wrapped across nodes.
  const probe = body.slice(0, 40);

  try {
    const found = await page.evaluate((needle) => {
      return (document.body.textContent || "").includes(needle);
    }, probe);

    if (!found) return false;

    // The composer should have been cleared on a successful send.
    const composerText = await page
      .locator(SELECTORS.messageComposer[0])
      .first()
      .textContent({ timeout: 2_000 })
      .catch(() => "");

    return !(composerText ?? "").includes(probe);
  } catch {
    return false;
  }
}
