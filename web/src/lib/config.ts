/**
 * Lazy, typed access to environment configuration.
 *
 * Every value is a getter so that importing this module never throws at build
 * time on a missing variable — the same reason `src/lib/db.ts` builds its pool
 * lazily. Validation is explicit and opt-in via the `assert*`
 * helpers, which report *every* missing key at once instead of failing on the
 * first one.
 */

function str(key: string): string | undefined {
  const value = process.env[key];
  return value && value.trim() !== "" ? value.trim() : undefined;
}

function bool(key: string, fallback: boolean): boolean {
  const value = str(key)?.toLowerCase();
  if (value === undefined) return fallback;
  return value === "true" || value === "1" || value === "yes";
}

function int(key: string, fallback: number): number {
  const value = str(key);
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const config = {
  // ---- Postgres ----
  get databaseUrl() {
    return str("DATABASE_URL");
  },

  // ---- Meta / Instagram Graph API (existing) ----
  get instagramAccessToken() {
    return str("INSTAGRAM_ACCESS_TOKEN");
  },
  get instagramVerifyToken() {
    return str("INSTAGRAM_VERIFY_TOKEN");
  },
  /** Optional. When unset, webhook signature verification is skipped with a warning. */
  get metaAppSecret() {
    return str("META_APP_SECRET");
  },
  /** The IG Business account id. Required to recognise (and skip) our own comments. */
  get igUserId() {
    return str("IG_USER_ID");
  },
  get graphApiVersion() {
    return str("GRAPH_API_VERSION") ?? "v24.0";
  },
  /**
   * Act on threaded replies (comments with a `parent_id`) as well as top-level
   * comments. Off by default: replying to replies produces long chains, and the
   * self-comment guard is the only thing preventing a loop.
   */
  get replyToThreadedComments() {
    return bool("REPLY_TO_THREADED_COMMENTS", false);
  },

  // ---- Dashboard auth ----
  get authJwtSecret() {
    return str("AUTH_JWT_SECRET");
  },

  // ---- AI (existing) ----
  get openrouterApiKey() {
    return str("OPENROUTER_API_KEY");
  },
  get aiModel() {
    return str("AI_MODEL");
  },

  // ---- Playwright worker (new) ----
  get playwrightUserDataDir() {
    return str("PLAYWRIGHT_USER_DATA_DIR") ?? "./.playwright-profile";
  },
  get playwrightHeadless() {
    return bool("PLAYWRIGHT_HEADLESS", true);
  },
  get playwrightLocale() {
    return str("PLAYWRIGHT_LOCALE") ?? "en-US";
  },
  get instagramWebUrl() {
    return str("INSTAGRAM_WEB_URL") ?? "https://www.instagram.com";
  },
  get pollIntervalMs() {
    return int("POLL_INTERVAL_MS", 30_000);
  },
  /** Upper bound on backoff after consecutive poll failures. */
  get maxPollBackoffMs() {
    return int("MAX_POLL_BACKOFF_MS", 300_000);
  },
  get maxNotificationScrolls() {
    return int("MAX_NOTIFICATION_SCROLLS", 3);
  },
  /** Randomised pause before each browser action, to look less robotic. */
  get actionDelayMinMs() {
    return int("ACTION_DELAY_MIN_MS", 3_000);
  },
  get actionDelayMaxMs() {
    return int("ACTION_DELAY_MAX_MS", 12_000);
  },
  /**
   * On the very first worker run the notifications page is full of historical
   * items. When true they are recorded as `skipped` instead of being acted on.
   */
  get backfillOnFirstRun() {
    return bool("PLAYWRIGHT_BACKFILL_ON_FIRST_RUN", true);
  },

  // ---- Global switches ----
  /** Decide and log everything, send nothing. */
  get dryRun() {
    return bool("DRY_RUN", false);
  },
  get logLevel() {
    return str("LOG_LEVEL") ?? "info";
  },
} as const;

class ConfigError extends Error {
  constructor(missing: string[], context: string) {
    super(
      `Missing required environment variable${missing.length > 1 ? "s" : ""} for ${context}: ${missing.join(", ")}`
    );
    this.name = "ConfigError";
  }
}

function assertKeys(keys: string[], context: string) {
  const missing = keys.filter((key) => !str(key));
  if (missing.length > 0) throw new ConfigError(missing, context);
}

/** Everything the Next.js server needs to talk to Postgres and the Graph API. */
export function assertMetaConfig() {
  assertKeys(
    [
      "DATABASE_URL",
      "INSTAGRAM_VERIFY_TOKEN",
      "IG_USER_ID",
    ],
    "the Meta webhook"
  );
}

/** The dashboard refuses to serve without a signing key. */
export function assertAuthConfig() {
  const secret = str("AUTH_JWT_SECRET");
  if (!secret || secret.length < 32) {
    throw new ConfigError(["AUTH_JWT_SECRET (min 32 chars)"], "dashboard authentication");
  }
}

/** Everything the Playwright worker process needs to boot. */
export function assertWorkerConfig() {
  assertKeys(["DATABASE_URL"], "the Playwright worker");
}
