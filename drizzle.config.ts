import { defineConfig } from "drizzle-kit"

import "dotenv/config"

/**
 * Note on `drizzle-kit generate` (Nov 2025-onwards): the team writes
 * post-0006 migrations by hand directly under `drizzle/migrations/*.sql`
 * (0007 → 0021 and the named ones). `meta/_journal.json` only tracks
 * the original auto-generated 0000-0006 set. As a result the schema.ts
 * has drifted from the last snapshot — drizzle-kit 0.31's stricter diff
 * heuristics surface this as a "column rename?" prompt. Resolving needs
 * a real interactive TTY (`drizzle-kit` refuses non-TTY for prompts).
 *
 * In practice: keep hand-writing new SQL files. Only run `db:generate`
 * on a real terminal, and only when ready to baseline the snapshot.
 */
export default defineConfig({
  out: "./drizzle/migrations",
  schema: "./drizzle/db/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
})
