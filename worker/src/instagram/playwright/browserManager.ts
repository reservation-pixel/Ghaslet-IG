import { chromium, type BrowserContext, type Page } from "playwright";
import path from "node:path";
import { config } from "@/lib/config";
import { createLogger } from "@/lib/logger";

const log = createLogger("playwright.browser");

let context: BrowserContext | null = null;
let starting: Promise<BrowserContext> | null = null;

const CHROME_ARGS = [
  "--disable-blink-features=AutomationControlled",
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-dev-shm-usage",
];

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/**
 * A single persistent Chromium profile, reused across polls.
 *
 * Persistence is what lets the manual login happen exactly once — cookies,
 * localStorage and device trust all live in the profile directory.
 */
export async function getContext(overrides?: { headless?: boolean }): Promise<BrowserContext> {
  if (context) return context;
  if (starting) return starting;

  const userDataDir = path.resolve(config.playwrightUserDataDir);
  const headless = overrides?.headless ?? config.playwrightHeadless;

  log.info("launching persistent browser context", { userDataDir, headless });

  starting = chromium
    .launchPersistentContext(userDataDir, {
      headless,
      viewport: { width: 1280, height: 900 },
      locale: config.playwrightLocale,
      userAgent: USER_AGENT,
      args: CHROME_ARGS,
      // Instagram nags for these; denying is quieter than dismissing a dialog.
      permissions: [],
    })
    .then((ctx) => {
      context = ctx;
      starting = null;

      ctx.on("close", () => {
        log.warn("browser context closed");
        context = null;
      });

      return ctx;
    })
    .catch((err) => {
      starting = null;
      throw err;
    });

  return starting;
}

/** The single working page. The worker never drives two pages at once. */
export async function getPage(overrides?: { headless?: boolean }): Promise<Page> {
  const ctx = await getContext(overrides);
  const existing = ctx.pages()[0];
  if (existing && !existing.isClosed()) return existing;
  return ctx.newPage();
}

export async function closeBrowser(): Promise<void> {
  if (!context) return;
  log.info("closing browser context");
  try {
    await context.close();
  } catch (err) {
    log.warn("error while closing browser", { error: err });
  } finally {
    context = null;
  }
}

/** Randomised pause, so actions don't land on a metronome. */
export function humanDelay(): Promise<void> {
  const min = config.actionDelayMinMs;
  const max = Math.max(min, config.actionDelayMaxMs);
  const ms = min + Math.floor(Math.random() * (max - min + 1));
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
