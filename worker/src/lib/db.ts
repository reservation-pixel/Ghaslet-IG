import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { createLogger } from "@/lib/logger";

const log = createLogger("db");

/**
 * Postgres connection pool.
 *
 * Lazy for the same reason the old Supabase client was: importing this module
 * must not throw at build time when DATABASE_URL is absent.
 */
let _pool: Pool | null = null;

export function getPool(): Pool {
  if (_pool) return _pool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Example: postgresql://postgres:password@localhost:5432/ghaslet"
    );
  }

  _pool = new Pool({
    connectionString,
    max: Number(process.env.PGPOOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    // Local Postgres has no TLS by default; a hosted one usually needs it.
    ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : undefined,
  });

  // An idle-client error would otherwise be an unhandled rejection that takes
  // the process down.
  _pool.on("error", (err) => {
    log.error("idle client error", { error: err });
  });

  return _pool;
}

export async function closePool(): Promise<void> {
  if (!_pool) return;
  await _pool.end();
  _pool = null;
}

/** Rows from a query. Parameters are always bound, never interpolated. */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = []
): Promise<T[]> {
  const result = await getPool().query<T>(text, params as never[]);
  return result.rows;
}

/** First row, or null. */
export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = []
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/** Row count for statements that don't return rows. */
export async function execute(text: string, params: unknown[] = []): Promise<number> {
  const result = await getPool().query(text, params as never[]);
  return result.rowCount ?? 0;
}

/** `select count(*)` as a number — Postgres returns bigint as a string. */
export async function count(text: string, params: unknown[] = []): Promise<number> {
  const row = await queryOne<{ count: string }>(text, params);
  return row ? Number(row.count) : 0;
}

export async function transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Postgres unique_violation.
 *
 * The Supabase client returned errors as values (`error.code === "23505"`);
 * `pg` throws them. Every insert that relied on that check needs a try/catch
 * around it instead — this predicate is what those catches test.
 */
export function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
}

export function isUndefinedTable(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "42P01";
}
