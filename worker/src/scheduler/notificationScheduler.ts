import type { Page } from "playwright";
import { config } from "@/lib/config";
import { createLogger } from "@/lib/logger";
import { pollOnce, type PollResult } from "@/instagram/playwright/notificationProcessor";
import { SessionExpiredError } from "@/instagram/playwright/sessionManager";
import { recordPoll } from "@/database/automationRuleRepository";

const log = createLogger("scheduler");

export interface SchedulerHandle {
  stop(): void;
  /** Resolves once the in-flight cycle finishes. */
  drain(): Promise<void>;
}

export interface SchedulerOptions {
  page: Page;
  intervalMs?: number;
}

/**
 * Self-rescheduling poll loop.
 *
 * Uses `setTimeout` rather than `setInterval` so a slow cycle can never overlap
 * itself — with a single browser page, two concurrent polls would collide.
 */
export function startScheduler({ page, intervalMs }: SchedulerOptions): SchedulerHandle {
  const baseInterval = intervalMs ?? config.pollIntervalMs;

  let stopped = false;
  let timer: NodeJS.Timeout | null = null;
  let inFlight: Promise<void> = Promise.resolve();
  let consecutiveFailures = 0;
  let paused = false;

  /** Exponential backoff with jitter, capped. */
  function nextDelay(): number {
    if (paused) {
      // Session is dead. Keep checking, but slowly — a human has to intervene.
      return config.maxPollBackoffMs;
    }
    if (consecutiveFailures === 0) {
      return baseInterval + Math.floor(Math.random() * 3_000);
    }
    const backoff = Math.min(
      baseInterval * 2 ** consecutiveFailures,
      config.maxPollBackoffMs
    );
    return backoff + Math.floor(Math.random() * 5_000);
  }

  function schedule() {
    if (stopped) return;
    const delay = nextDelay();
    log.debug("next poll scheduled", { delayMs: delay, paused, consecutiveFailures });
    timer = setTimeout(run, delay);
  }

  async function run() {
    if (stopped) return;

    inFlight = (async () => {
      try {
        const result: PollResult = await pollOnce(page);
        consecutiveFailures = 0;

        if (paused) {
          log.info("session recovered, resuming normal cadence", { event: "session_recovered" });
          paused = false;
        }

        log.debug("poll cycle ok", { ...result });
      } catch (err) {
        if (err instanceof SessionExpiredError) {
          // Not a transient failure — pause instead of hammering a login wall.
          if (!paused) {
            log.error("pausing poll loop until the session is restored", {
              event: "session_expired",
              hint: "run `npm run worker:login`",
            });
          }
          paused = true;
        } else {
          consecutiveFailures++;
          log.error("poll cycle failed", { error: err, consecutiveFailures });
          await recordPoll({
            sessionValid: true,
            error: err instanceof Error ? err.message : String(err),
          }).catch(() => {});
        }
      } finally {
        schedule();
      }
    })();

    await inFlight;
  }

  log.info("scheduler started", { intervalMs: baseInterval, dryRun: config.dryRun });
  // Run the first cycle immediately rather than waiting a full interval.
  void run();

  return {
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
      log.info("scheduler stopped");
    },
    drain() {
      return inFlight;
    },
  };
}
