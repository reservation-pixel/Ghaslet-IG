import type { Page } from "playwright";
import { config } from "@/lib/config";
import { createLogger } from "@/lib/logger";
import { SELECTORS, firstVisible } from "@/instagram/playwright/selectors";
import { dismissPopups } from "@/instagram/playwright/popupHandler";
import { sleep } from "@/instagram/playwright/browserManager";

const log = createLogger("playwright.watcher");

/** One notification row, reduced to the fields the parser needs. */
export interface RawNotificationRow {
  /** Full visible text of the row, e.g. "someone started following you 2h". */
  text: string;
  /** Every href in the row, in DOM order. The first is usually the actor. */
  hrefs: string[];
}

/**
 * Open the notifications surface and scrape the visible rows.
 *
 * Extraction runs inside a single `page.evaluate` so the DOM is read in one
 * shot — walking it through many round-trips is slow and races Instagram's
 * virtualised list.
 */
export async function fetchNotifications(page: Page): Promise<RawNotificationRow[]> {
  await openNotifications(page);

  const scrolls = Math.max(0, config.maxNotificationScrolls);
  for (let i = 0; i < scrolls; i++) {
    await scrollPanel(page);
    await sleep(800);
  }

  const rows = await page.evaluate(() => {
    // Prefer the flyout dialog; fall back to the standalone /notifications page.
    const root =
      document.querySelector('div[role="dialog"]') ||
      document.querySelector("section main") ||
      document.body;

    if (!root) return [] as { text: string; hrefs: string[] }[];

    const anchors = Array.from(root.querySelectorAll<HTMLAnchorElement>('a[href^="/"]'));

    // Each notification row is the nearest ancestor that contains exactly one
    // actor link plus its text. Walk up a bounded number of levels to find a
    // container that has meaningful text.
    const seen = new Set<Element>();
    const out: { text: string; hrefs: string[] }[] = [];

    for (const anchor of anchors) {
      let container: Element | null = anchor;
      for (let depth = 0; depth < 6 && container; depth++) {
        const text = (container.textContent || "").trim();
        if (text.length > 15 && text.length < 400) break;
        container = container.parentElement;
      }
      if (!container || seen.has(container)) continue;
      seen.add(container);

      const text = (container.textContent || "").replace(/\s+/g, " ").trim();
      if (!text) continue;

      const hrefs = Array.from(container.querySelectorAll<HTMLAnchorElement>('a[href^="/"]'))
        .map((a) => a.getAttribute("href") || "")
        .filter(Boolean);

      out.push({ text, hrefs });
    }

    return out;
  });

  log.debug("scraped notification rows", { count: rows.length });
  return rows;
}

async function openNotifications(page: Page): Promise<void> {
  // The dedicated URL is more reliable than clicking the nav item, which
  // sometimes opens a flyout that closes on the next navigation.
  await page.goto(`${config.instagramWebUrl}/notifications/`, {
    waitUntil: "domcontentloaded",
    timeout: 45_000,
  });
  await dismissPopups(page);

  const panel = await firstVisible(page, SELECTORS.notificationsPanel, 8_000);

  if (!panel) {
    log.debug("notifications panel not found via URL, trying nav button");
    const navButton = await firstVisible(page, SELECTORS.notificationsNavButton, 5_000);
    if (navButton) {
      await navButton.click({ timeout: 5_000 }).catch(() => {});
      await dismissPopups(page);
      await sleep(1_500);
    }
  }

  // Let the virtualised list settle.
  await sleep(1_500);
}

async function scrollPanel(page: Page): Promise<void> {
  await page.evaluate(() => {
    const root =
      document.querySelector('div[role="dialog"]') || document.querySelector("section main");
    if (!root) {
      window.scrollBy(0, window.innerHeight);
      return;
    }

    // Find the actual scrolling element inside the panel.
    const scrollable =
      Array.from(root.querySelectorAll<HTMLElement>("*")).find(
        (el) => el.scrollHeight > el.clientHeight + 50
      ) ?? (root as HTMLElement);

    scrollable.scrollTop = scrollable.scrollHeight;
  });
}
