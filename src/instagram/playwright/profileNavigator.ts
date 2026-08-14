import type { Locator, Page } from "playwright";
import { config } from "@/lib/config";
import { createLogger } from "@/lib/logger";
import { SELECTORS, anyVisible, firstVisible } from "@/instagram/playwright/selectors";
import { dismissPopups } from "@/instagram/playwright/popupHandler";
import { sleep } from "@/instagram/playwright/browserManager";

const log = createLogger("playwright.profile");

export class ProfileUnreachableError extends Error {
  constructor(username: string, reason: string) {
    super(`Cannot reach @${username}: ${reason}`);
    this.name = "ProfileUnreachableError";
  }
}

export async function openProfile(page: Page, username: string): Promise<void> {
  await page.goto(`${config.instagramWebUrl}/${encodeURIComponent(username)}/`, {
    waitUntil: "domcontentloaded",
    timeout: 45_000,
  });
  await dismissPopups(page);

  if (await anyVisible(page, SELECTORS.profileNotFound, 2_000)) {
    throw new ProfileUnreachableError(username, "profile not found");
  }
}

/**
 * Open a DM thread with a user and return the composer.
 *
 * Goes through the profile's Message button rather than `/direct/new/`, which
 * requires a search interaction and is markedly more fragile.
 */
export async function openDmThread(page: Page, username: string): Promise<Locator> {
  await openProfile(page, username);

  const messageButton = await firstVisible(page, SELECTORS.messageButton, 10_000);
  if (!messageButton) {
    // Private accounts that don't accept messages simply have no button.
    throw new ProfileUnreachableError(username, "no Message button (account may restrict DMs)");
  }

  await messageButton.click({ timeout: 10_000 });
  await sleep(2_000);
  await dismissPopups(page);

  const composer = await firstVisible(page, SELECTORS.messageComposer, 15_000);
  if (!composer) {
    throw new ProfileUnreachableError(username, "DM composer never appeared");
  }

  log.debug("DM thread open", { username });
  return composer;
}
