// Applies supabase/migrations/*.sql in name order, once each.
// Usage: npm run db:migrate            (apply pending)
//        npm run db:migrate -- --status (list only)
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: join(root, ".env.local"), quiet: true });

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is missing in .env.local");
  process.exit(1);
}

const dir = join(root, "supabase", "migrations");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const statusOnly = process.argv.includes("--status");

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

try {
  await client.query(`
    create schema if not exists ops;
    revoke all on schema ops from public, anon, authenticated;
    create table if not exists ops.migrations (name text primary key, applied_at timestamptz not null default now());
  `);
  const { rows } = await client.query("select name from ops.migrations");
  const done = new Set(rows.map((r) => r.name));

  for (const f of files) {
    if (done.has(f)) {
      console.log(`  ✓ ${f}`);
      continue;
    }
    if (statusOnly) {
      console.log(`  · ${f}  (pending)`);
      continue;
    }
    process.stdout.write(`  → ${f} ... `);
    await client.query("begin");
    try {
      await client.query(readFileSync(join(dir, f), "utf8"));
      await client.query("insert into ops.migrations (name) values ($1)", [f]);
      await client.query("commit");
      console.log("applied");
    } catch (e) {
      await client.query("rollback");
      console.log("FAILED");
      console.error(e.message);
      process.exit(1);
    }
  }
} finally {
  await client.end();
}
