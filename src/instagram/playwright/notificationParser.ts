import { createLogger } from "@/lib/logger";
import type { RawNotificationRow } from "@/instagram/playwright/notificationWatcher";

const log = createLogger("playwright.parser");

export interface ParsedNotification {
  type: "follow" | "like";
  username: string;
  /** Post/reel the like refers to. Null for follows. */
  targetHref: string | null;
  /**
   * Stable dedupe key.
   *
   * Deliberately excludes the relative timestamp ("2h", "1d") — that text
   * mutates between polls and would make every notification look new.
   */
  externalId: string;
  rawText: string;
}

const FOLLOW_PATTERN = /started following you/i;
const LIKE_PATTERN = /liked your (photo|video|post|reel|story|comment)/i;

/** Non-profile paths that can appear first in a row's href list. */
const NON_PROFILE_PREFIXES = [
  "/p/",
  "/reel/",
  "/reels/",
  "/stories/",
  "/explore/",
  "/direct/",
  "/accounts/",
  "/notifications/",
  "/tv/",
];

function isProfileHref(href: string): boolean {
  if (!href.startsWith("/")) return false;
  if (NON_PROFILE_PREFIXES.some((prefix) => href.startsWith(prefix))) return false;
  // A profile href is "/username/" — one path segment.
  const segments = href.split("/").filter(Boolean);
  return segments.length === 1;
}

function extractUsername(hrefs: string[]): string | null {
  const profile = hrefs.find(isProfileHref);
  if (!profile) return null;
  return profile.split("/").filter(Boolean)[0] ?? null;
}

function extractTargetHref(hrefs: string[]): string | null {
  return hrefs.find((h) => h.startsWith("/p/") || h.startsWith("/reel/") || h.startsWith("/tv/")) ?? null;
}

/**
 * Classify scraped rows into follow/like notifications.
 *
 * Comments are intentionally NOT parsed here — they arrive through the Meta
 * webhook, which gives a real comment id and a supported reply API.
 */
export function parseNotifications(rows: RawNotificationRow[]): ParsedNotification[] {
  const out: ParsedNotification[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const isFollow = FOLLOW_PATTERN.test(row.text);
    const isLike = !isFollow && LIKE_PATTERN.test(row.text);

    if (!isFollow && !isLike) continue;

    const username = extractUsername(row.hrefs);
    if (!username) {
      log.debug("notification without a resolvable username", { text: row.text.slice(0, 80) });
      continue;
    }

    const type = isFollow ? "follow" : "like";
    const targetHref = isFollow ? null : extractTargetHref(row.hrefs);

    // A user can follow once and can like a given post once, so these are
    // stable identities without needing a timestamp.
    const externalId =
      type === "follow" ? `follow:${username}` : `like:${username}:${targetHref ?? "unknown"}`;

    // The same row can be scraped twice within one pass after a scroll.
    if (seen.has(externalId)) continue;
    seen.add(externalId);

    out.push({
      type,
      username,
      targetHref,
      externalId,
      rawText: row.text.slice(0, 500),
    });
  }

  log.debug("parsed notifications", {
    total: rows.length,
    follows: out.filter((n) => n.type === "follow").length,
    likes: out.filter((n) => n.type === "like").length,
  });

  return out;
}
