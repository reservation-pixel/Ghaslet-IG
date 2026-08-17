import type { Page } from "playwright";
import { SELECTORS, firstVisible } from "@/instagram/playwright/selectors";
import { createLogger } from "@/lib/logger";

const log = createLogger("playwright.popups");

/**
 * Dismiss the interstitials Instagram throws up after navigation: the cookie
 * banner, "Save your login info?", "Turn on notifications", "Add to home
 * screen". Best-effort and never throws — a missing popup is the normal case.
 */
export async function dismissPopups(page: Page): Promise<void> {
  const groups: [string, readonly string[]][] = [
    ["cookieBanner", SELECTORS.popups.cookieBanner],
    ["saveLoginInfo", SELECTORS.popups.saveLoginInfo],
    ["turnOnNotifications", SELECTORS.popups.turnOnNotifications],
    ["addToHomeScreen", SELECTORS.popups.addToHomeScreen],
  ];

  for (const [name, candidates] of groups) {
    try {
      const button = await firstVisible(page, candidates, 1_000);
      if (!button) continue;

      await button.click({ timeout: 3_000 });
      log.debug("dismissed popup", { popup: name });
      await page.waitForTimeout(500);
    } catch (err) {
      log.debug("popup dismissal skipped", { popup: name, error: err });
    }
  }
}
