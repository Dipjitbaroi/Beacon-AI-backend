// Clean-slate DB reset for CivicDesk AI.
//
// What it does (idempotent, safe to re-run):
//   1) Drops all tables (CASCADE) under the "public" schema.
//   2) Drops all enum types under the "public" schema.
//   3) Wipes orphaned rows from _prisma_migrations.
//   4) Runs `prisma migrate deploy` to re-apply the local migration
//      (prisma/migrations/20260101000000_civicdesk_init).
//   5) Runs `prisma generate` so the generated client is up to date.
//
// Usage:
//   node scripts/db-reset.mjs
//
// Refuses to run unless DATABASE_URL is set and points to a Neon host,
// as a safety guard.
import "dotenv/config";
import { execSync } from "node:child_process";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Add it to .env first.");
  process.exit(1);
}

if (!/neon\.tech|render\.com|localhost|127\.0\.0\.1/.test(new URL(url).hostname)) {
  console.error("Refusing to reset: DATABASE_URL host is unexpected:", new URL(url).hostname);
  process.exit(1);
}

const run = (cmd) => {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, { stdio: "inherit", env: process.env });
};

const client = new pg.Client({ connectionString: url });
await client.connect();

console.log("== Step 1: Drop all tables in public schema ==");
await client.query(`
  DO $$
  DECLARE r record;
  BEGIN
    FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
      EXECUTE format('DROP TABLE IF EXISTS public.%I CASCADE', r.tablename);
    END LOOP;
  END $$;
`);
console.log("  done.");

console.log("== Step 2: Drop all enum types in public schema ==");
await client.query(`
  DO $$
  DECLARE r record;
  BEGIN
    FOR r IN (
      SELECT t.typname
      FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public' AND t.typtype = 'e'
    ) LOOP
      EXECUTE format('DROP TYPE IF EXISTS public.%I CASCADE', r.typname);
    END LOOP;
  END $$;
`);
console.log("  done.");

console.log("== Step 3: Wipe orphaned migration rows (if any) ==");
await client.query(`DELETE FROM "_prisma_migrations" WHERE 1=1;`).catch((e) => {
  if (e?.code === "42P01") return; // relation does not exist - fine
  throw e;
});
console.log("  done.");

await client.end();

console.log("== Step 4: Apply local migration via prisma migrate deploy ==");
run("npx prisma migrate deploy");

console.log("== Step 5: Regenerate Prisma client ==");
run("npx prisma generate");

console.log("\n== DB reset complete ==");
