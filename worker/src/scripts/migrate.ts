import { config as loadEnv } from "dotenv";
import path from "node:path";
import fs from "node:fs";
import { createHash } from "node:crypto";

loadEnv({ path: path.resolve(process.cwd(), ".env.local") });
loadEnv({ path: path.resolve(process.cwd(), ".env") });
loadEnv({ path: path.resolve(process.cwd(), "../.env.all") });

import { closePool, getPool } from "@/lib/db";

/**
 * Apply db/migrations/*.sql in filename order, once each.
 *
 *   npm run db:migrate
 *   npm run db:migrate -- --status
 *
 * Each file runs inside a transaction, so a failure part-way leaves nothing
 * half-applied. Applied files are recorded with a checksum: editing a migration
 * that has already run is a mistake worth catching loudly rather than silently
 * skipping.
 */

const MIGRATIONS_DIR = path.resolve(process.cwd(), "db/migrations");

function die(message: string): never {
  console.error(`\n  x ${message}\n`);
  process.exit(1);
}

function checksum(sql: string): string {
  // Normalise line endings so a git checkout on Windows doesn't look modified.
  return createHash("sha256").update(sql.replace(/\r\n/g, "\n")).digest("hex").slice(0, 16);
}

interface AppliedRow {
  name: string;
  checksum: string;
  applied_at: string;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    die("DATABASE_URL is not set in .env.local");
  }
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    die(`No migrations directory at ${MIGRATIONS_DIR}`);
  }

  const pool = getPool();

  await pool.query(`
    create table if not exists schema_migrations (
      name text primary key,
      checksum text not null,
      applied_at timestamptz not null default now()
    )
  `);

  const { rows: applied } = await pool.query<AppliedRow>(
    "select name, checksum, applied_at from schema_migrations order by name"
  );
  const appliedByName = new Map(applied.map((r) => [r.name, r]));

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  if (process.argv.includes("--status")) {
    console.log("");
    for (const file of files) {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
      const row = appliedByName.get(file);
      if (!row) {
        console.log(`  pending   ${file}`);
      } else if (row.checksum !== checksum(sql)) {
        console.log(`  MODIFIED  ${file}  (applied ${row.applied_at})`);
      } else {
        console.log(`  applied   ${file}`);
      }
    }
    console.log("");
    await closePool();
    return;
  }

  let ran = 0;

  for (const file of files) {
    const full = path.join(MIGRATIONS_DIR, file);
    const sql = fs.readFileSync(full, "utf8");
    const sum = checksum(sql);
    const row = appliedByName.get(file);

    if (row) {
      if (row.checksum !== sum) {
        console.warn(
          `  ! ${file} has changed since it was applied. Skipping.\n` +
            "    Add a new migration instead of editing an applied one."
        );
      }
      continue;
    }

    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query("insert into schema_migrations (name, checksum) values ($1, $2)", [
        file,
        sum,
      ]);
      await client.query("commit");
      console.log(`  applied  ${file}`);
      ran++;
    } catch (err) {
      await client.query("rollback").catch(() => {});
      client.release();
      await closePool();
      die(`${file} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    client.release();
  }

  console.log(ran === 0 ? "\n  Already up to date.\n" : `\n  Applied ${ran} migration(s).\n`);
  await closePool();
}

main().catch(async (err) => {
  await closePool().catch(() => {});
  die(err instanceof Error ? err.message : String(err));
});
