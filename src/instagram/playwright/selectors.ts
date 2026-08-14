import type { Locator, Page } from "playwright";

/**
 * Every DOM selector used against instagram.com, in one place.
 *
 * Instagram ships obfuscated class names that change without notice, so each
 * target is an ordered list of candidates: stable semantics first (role,
 * aria-label, visible text), brittle structure last. When something breaks,
 * this is the only file that should need editing.
 */

export const SELECTORS = {
  /** Presence of any of these means we are NOT logged in. */
  loginForm: [
    'input[name="username"]',
    'form#loginForm',
    'button:has-text("Log in")',
  ],

  /** Presence of any of these means we ARE logged in. */
  loggedIn: [
    'svg[aria-label="Home"]',
    'a[href="/"] svg[aria-label="Home"]',
    '[aria-label="Home"]',
    'nav a[href^="/direct/"]',
  ],

  /** Opens the notifications flyout from the left nav. */
  notificationsNavButton: [
    'a[href="/notifications/"]',
    'svg[aria-label="Notifications"]',
    '[aria-label="Notifications"]',
    'span:has-text("Notifications")',
  ],

  /** Container that holds the notification rows once the panel is open. */
  notificationsPanel: [
    'div[role="dialog"]',
    'section main',
    'div[style*="overflow"] >> nth=0',
  ],

  /** Individual notification rows inside the panel. */
  notificationRow: [
    'div[role="dialog"] a[href^="/"]:has(img)',
    'div[role="listitem"]',
    'section main div[role="button"]',
  ],

  /** Profile page: the Message button. */
  messageButton: [
    'div[role="button"]:has-text("Message")',
    'button:has-text("Message")',
    'a:has-text("Message")',
  ],

  /** DM thread: the composer. */
  messageComposer: [
    'div[role="textbox"][contenteditable="true"]',
    'textarea[placeholder*="Message"]',
    'div[aria-label="Message"][contenteditable="true"]',
  ],

  /** DM thread: the send control (Enter usually suffices). */
  sendButton: ['div[role="button"]:has-text("Send")', 'button[type="submit"]:has-text("Send")'],

  /** Shown when a profile does not exist. */
  profileNotFound: [
    'text=Sorry, this page isn\'t available.',
    'text=Page Not Found',
  ],

  /** Dismissable interstitials, in the order they usually appear. */
  popups: {
    cookieBanner: [
      'button:has-text("Allow all cookies")',
      'button:has-text("Accept All")',
      'button:has-text("Only allow essential cookies")',
    ],
    saveLoginInfo: ['button:has-text("Not now")', 'button:has-text("Not Now")'],
    turnOnNotifications: [
      'button:has-text("Not Now")',
      'div[role="dialog"] button:has-text("Cancel")',
    ],
    addToHomeScreen: ['button:has-text("Cancel")'],
  },
} as const;

/**
 * Try each candidate in order and return the first one that is actually
 * visible. Returns null rather than throwing — callers decide whether a missing
 * element is fatal.
 */
export async function firstVisible(
  page: Page,
  candidates: readonly string[],
  timeoutMs = 5_000
): Promise<Locator | null> {
  const deadline = Date.now() + timeoutMs;

  do {
    for (const selector of candidates) {
      const locator = page.locator(selector).first();
      try {
        if (await locator.isVisible({ timeout: 250 })) return locator;
      } catch {
        // Selector didn't resolve on this pass; try the next candidate.
      }
    }
  } while (Date.now() < deadline);

  return null;
}

/** True when any candidate is visible. */
export async function anyVisible(
  page: Page,
  candidates: readonly string[],
  timeoutMs = 3_000
): Promise<boolean> {
  return (await firstVisible(page, candidates, timeoutMs)) !== null;
}
