import { defineConfig } from "drizzle-kit"

import "dotenv/config"

/**
 * Note on `drizzle-kit generate` (Nov 2025-onwards): the team writes
 * post-0006 migrations by hand directly under `drizzle/migrations/*.sql`
 * (0007+ and the named ones). `meta/_journal.json` only tracks the
 * original auto-generated 0000–0006 set, so `drizzle-kit migrate` on
 * its own silently ignores every hand-written file.
 *
 * `bun run db:migrate` now chains a second pass — `scripts/apply-pending-sql.ts`
 * — that records hand-written applications in `manual_migrations_applied`
 * and applies anything not yet there. On a DB whose hand migrations were
 * already run by hand (e.g. prod), run `bun run db:migrate:bootstrap`
 * once first to mark them as applied without re-running.
 *
 * Keep writing new migrations as hand SQL. `db:generate` is only useful
 * to baseline the snapshot on a real TTY when you want drizzle-kit to
 * regain ownership; until then, schema.ts is the source of truth at
 * runtime and the hand SQL is the source of truth in the database.
 */
export default defineConfig({
  out: "./drizzle/migrations",
  schema: "./drizzle/db/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
})
