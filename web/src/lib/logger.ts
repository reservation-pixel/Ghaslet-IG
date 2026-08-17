/**
 * Zero-dependency structured JSON logger.
 *
 * Works unchanged in both processes: the Next.js server and the Playwright
 * worker. Emits one JSON object per line so output can be piped straight into
 * any log collector.
 *
 *   { "ts": "...", "level": "info", "scope": "webhook", "msg": "...", ...fields }
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function activeLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL || "info").toLowerCase();
  return raw in LEVEL_ORDER ? (raw as LogLevel) : "info";
}

export type LogFields = Record<string, unknown>;

export interface Logger {
  debug(msg: string, fields?: LogFields): void;
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
  child(bindings: LogFields): Logger;
}

/**
 * Errors don't survive JSON.stringify — pull the useful bits out by hand.
 */
function normalize(value: unknown): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
      ...(value.cause ? { cause: normalize(value.cause) } : {}),
    };
  }
  return value;
}

function normalizeFields(fields: LogFields): LogFields {
  const out: LogFields = {};
  for (const [key, value] of Object.entries(fields)) {
    out[key] = normalize(value);
  }
  return out;
}

function emit(level: LogLevel, scope: string, bindings: LogFields, msg: string, fields?: LogFields) {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[activeLevel()]) return;

  const record = {
    ts: new Date().toISOString(),
    level,
    scope,
    msg,
    ...normalizeFields(bindings),
    ...(fields ? normalizeFields(fields) : {}),
  };

  let line: string;
  try {
    line = JSON.stringify(record);
  } catch {
    // Circular reference somewhere in the fields — never let logging throw.
    line = JSON.stringify({ ts: record.ts, level, scope, msg, fieldsError: "unserializable" });
  }

  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export function createLogger(scope: string, bindings: LogFields = {}): Logger {
  return {
    debug: (msg, fields) => emit("debug", scope, bindings, msg, fields),
    info: (msg, fields) => emit("info", scope, bindings, msg, fields),
    warn: (msg, fields) => emit("warn", scope, bindings, msg, fields),
    error: (msg, fields) => emit("error", scope, bindings, msg, fields),
    child: (extra) => createLogger(scope, { ...bindings, ...extra }),
  };
}

export const logger = createLogger("app");
