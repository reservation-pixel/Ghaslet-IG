import { execute, query, queryOne } from "@/lib/db";
import { createLogger } from "@/lib/logger";
import type { AutomationRule, AutomationSettings, EventType } from "@/lib/types";

const log = createLogger("db.rules");

const SETTINGS_ID = 1;

/** Rules and settings are read on every event; a short TTL keeps that cheap. */
const CACHE_TTL_MS = 30_000;

let rulesCache: { at: number; rows: AutomationRule[] } | null = null;
let settingsCache: { at: number; row: AutomationSettings } | null = null;

/** Called after any write so the next read reflects it immediately. */
export function invalidateCache() {
  rulesCache = null;
  settingsCache = null;
}

async function loadAllRules(): Promise<AutomationRule[]> {
  if (rulesCache && Date.now() - rulesCache.at < CACHE_TTL_MS) {
    return rulesCache.rows;
  }

  try {
    const rows = await query<AutomationRule>(
      "select * from automation_rules order by priority desc, created_at asc"
    );
    rulesCache = { at: Date.now(), rows };
    return rows;
  } catch (err) {
    log.error("failed to load automation rules", { error: err });
    // Serve stale over nothing — a missing rule means no reply at all.
    return rulesCache?.rows ?? [];
  }
}

/** Enabled rules for one event type, highest priority first. */
export async function getRules(eventType: EventType): Promise<AutomationRule[]> {
  const all = await loadAllRules();
  return all.filter((rule) => rule.enabled && rule.event_type === eventType);
}

export async function listRules(): Promise<AutomationRule[]> {
  return loadAllRules();
}

const DEFAULT_SETTINGS: AutomationSettings = {
  id: SETTINGS_ID,
  use_ai: true,
  follow_automation_enabled: true,
  like_automation_enabled: false,
  comment_automation_enabled: true,
  daily_dm_cap: 40,
  playwright_session_valid: false,
  playwright_last_poll_at: null,
  playwright_last_error: null,
  updated_at: new Date(0).toISOString(),
};

export async function getSettings(): Promise<AutomationSettings> {
  if (settingsCache && Date.now() - settingsCache.at < CACHE_TTL_MS) {
    return settingsCache.row;
  }

  try {
    const row = await queryOne<AutomationSettings>(
      "select * from automation_settings where id = $1",
      [SETTINGS_ID]
    );
    if (!row) return settingsCache?.row ?? DEFAULT_SETTINGS;

    settingsCache = { at: Date.now(), row };
    return row;
  } catch (err) {
    log.error("failed to load automation settings, using defaults", { error: err });
    return settingsCache?.row ?? DEFAULT_SETTINGS;
  }
}

const SETTINGS_COLUMNS = [
  "use_ai",
  "follow_automation_enabled",
  "like_automation_enabled",
  "comment_automation_enabled",
  "daily_dm_cap",
  "playwright_session_valid",
  "playwright_last_poll_at",
  "playwright_last_error",
] as const;

export async function updateSettings(
  patch: Partial<Omit<AutomationSettings, "id" | "updated_at">>
): Promise<AutomationSettings> {
  const sets: string[] = [];
  const params: unknown[] = [];

  for (const column of SETTINGS_COLUMNS) {
    if (patch[column] !== undefined) {
      params.push(patch[column]);
      sets.push(`${column} = $${params.length}`);
    }
  }

  invalidateCache();

  if (sets.length === 0) return getSettings();

  params.push(SETTINGS_ID);
  const row = await queryOne<AutomationSettings>(
    `update automation_settings
        set ${sets.join(", ")}, updated_at = now()
      where id = $${params.length}
      returning *`,
    params
  );

  if (!row) throw new Error("updateSettings matched no row");
  return row;
}

/**
 * Heartbeat written by the scheduler each cycle. Kept separate from
 * `updateSettings` so a failing heartbeat never throws into the poll loop.
 */
export async function recordPoll(fields: {
  sessionValid: boolean;
  error?: string | null;
}): Promise<void> {
  try {
    await execute(
      `update automation_settings
          set playwright_session_valid = $1,
              playwright_last_poll_at = now(),
              playwright_last_error = $2,
              updated_at = now()
        where id = $3`,
      [fields.sessionValid, fields.error ?? null, SETTINGS_ID]
    );
    invalidateCache();
  } catch (err) {
    log.error("recordPoll failed", { error: err });
  }
}

export type RuleInput = Partial<Omit<AutomationRule, "id" | "created_at" | "updated_at">>;

export async function createRule(input: RuleInput): Promise<AutomationRule> {
  invalidateCache();

  const row = await queryOne<AutomationRule>(
    `insert into automation_rules
       (event_type, match_keywords, public_reply_template, dm_template,
        use_ai, ai_instruction, enabled, priority)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     returning *`,
    [
      input.event_type,
      input.match_keywords ?? null,
      input.public_reply_template ?? null,
      input.dm_template ?? null,
      input.use_ai ?? false,
      input.ai_instruction ?? null,
      input.enabled ?? true,
      input.priority ?? 0,
    ]
  );

  if (!row) throw new Error("createRule returned no row");
  return row;
}

const RULE_COLUMNS = [
  "event_type",
  "match_keywords",
  "public_reply_template",
  "dm_template",
  "use_ai",
  "ai_instruction",
  "enabled",
  "priority",
] as const;

export async function updateRule(id: string, patch: RuleInput): Promise<AutomationRule> {
  const sets: string[] = [];
  const params: unknown[] = [];

  for (const column of RULE_COLUMNS) {
    if (patch[column] !== undefined) {
      params.push(patch[column]);
      sets.push(`${column} = $${params.length}`);
    }
  }

  invalidateCache();

  if (sets.length === 0) {
    const current = await queryOne<AutomationRule>("select * from automation_rules where id = $1", [
      id,
    ]);
    if (!current) throw new Error("updateRule: no such rule");
    return current;
  }

  params.push(id);
  const row = await queryOne<AutomationRule>(
    `update automation_rules
        set ${sets.join(", ")}, updated_at = now()
      where id = $${params.length}
      returning *`,
    params
  );

  if (!row) throw new Error("updateRule: no such rule");
  return row;
}

export async function deleteRule(id: string): Promise<void> {
  invalidateCache();
  await execute("delete from automation_rules where id = $1", [id]);
}
