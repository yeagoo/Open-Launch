#!/usr/bin/env bun
// Applies hand-written SQL files under `drizzle/migrations/` that aren't
// tracked in `_journal.json`. Pairs with `drizzle-kit migrate` to cover
// both auto-generated migrations (0000–0006) and the hand-written ones
// the team writes directly as `.sql` files (0007+ and `add_*.sql`).
//
// Applied state lives in `manual_migrations_applied` so re-runs are safe.
//
// Usage:
//   bun scripts/apply-pending-sql.ts                       apply pending
//   bun scripts/apply-pending-sql.ts --dry-run             list pending only
//   bun scripts/apply-pending-sql.ts --mark-all-applied    record every
//                                                          existing file as
//                                                          applied without
//                                                          running it
//   bun scripts/apply-pending-sql.ts --mark-applied-through 0021_foo.sql
//                                                          record every file
//                                                          up to & including
//                                                          the named one as
//                                                          applied; leave the
//                                                          rest pending
//
// The two --mark-* modes are bootstraps for DBs whose hand migrations
// were run manually before this runner existed.
import { createHash } from "node:crypto"
import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"

import "dotenv/config"

import { Client } from "pg"

const MIGRATIONS_DIR = "drizzle/migrations"
const TRACKER_TABLE = "manual_migrations_applied"

const argv = process.argv.slice(2)
const argSet = new Set(argv)
const MARK_ALL = argSet.has("--mark-all-applied")
const DRY_RUN = argSet.has("--dry-run")
const markThroughIdx = argv.indexOf("--mark-applied-through")
const MARK_THROUGH = markThroughIdx >= 0 ? argv[markThroughIdx + 1] : undefined
if (markThroughIdx >= 0 && !MARK_THROUGH) {
  throw new Error("--mark-applied-through requires a filename argument")
}

async function main() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set")
  }

  const client = new Client({ connectionString })
  await client.connect()

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${TRACKER_TABLE} (
        filename text PRIMARY KEY,
        content_hash text NOT NULL,
        applied_at timestamp NOT NULL DEFAULT now()
      )
    `)

    // Files drizzle-kit owns — skip them. `drizzle-kit migrate` runs
    // these and records them in its own `__drizzle_migrations` table.
    const journal = JSON.parse(
      await readFile(join(MIGRATIONS_DIR, "meta", "_journal.json"), "utf-8"),
    ) as { entries: Array<{ tag: string }> }
    const journalFiles = new Set(journal.entries.map((e) => `${e.tag}.sql`))

    const allFiles = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort()

    const { rows: trackerRows } = await client.query<{
      filename: string
      content_hash: string
    }>(`SELECT filename, content_hash FROM ${TRACKER_TABLE}`)
    const tracked = new Map(trackerRows.map((r) => [r.filename, r.content_hash]))

    const candidates = allFiles.filter((f) => !journalFiles.has(f))

    if (MARK_ALL || MARK_THROUGH) {
      let cutoffIdx: number
      if (MARK_THROUGH) {
        cutoffIdx = candidates.indexOf(MARK_THROUGH)
        if (cutoffIdx < 0) {
          throw new Error(
            `--mark-applied-through: ${MARK_THROUGH} not found among hand-written migrations`,
          )
        }
      } else {
        cutoffIdx = candidates.length - 1
      }
      const toMark = candidates.slice(0, cutoffIdx + 1)
      let inserted = 0
      for (const filename of toMark) {
        if (tracked.has(filename)) continue
        const content = await readFile(join(MIGRATIONS_DIR, filename), "utf-8")
        const hash = createHash("sha256").update(content).digest("hex")
        await client.query(
          `INSERT INTO ${TRACKER_TABLE} (filename, content_hash) VALUES ($1, $2)
           ON CONFLICT (filename) DO NOTHING`,
          [filename, hash],
        )
        inserted++
      }
      console.log(`✓ Bootstrap complete — marked ${inserted} file(s) as already applied.`)
      if (MARK_THROUGH) {
        const remaining = candidates.slice(cutoffIdx + 1)
        if (remaining.length > 0) {
          console.log(
            `  ${remaining.length} file(s) remain pending; run \`bun run db:migrate\` to apply:`,
          )
          for (const f of remaining) console.log(`    - ${f}`)
        }
      }
      console.log(
        `  (${tracked.size} were already recorded; ${journalFiles.size} owned by drizzle-kit.)`,
      )
      return
    }

    const pending = candidates.filter((f) => !tracked.has(f))

    // Warn if a tracked file's on-disk content has drifted from what we
    // recorded — usually means someone hand-edited an applied migration.
    for (const filename of candidates) {
      const previousHash = tracked.get(filename)
      if (!previousHash) continue
      const content = await readFile(join(MIGRATIONS_DIR, filename), "utf-8")
      const hash = createHash("sha256").update(content).digest("hex")
      if (hash !== previousHash) {
        console.warn(
          `⚠ ${filename} content changed since application (hash drift). ` +
            `If you edited an applied migration, write a follow-up file instead.`,
        )
      }
    }

    if (pending.length === 0) {
      console.log("✓ No pending hand-written migrations.")
      return
    }

    console.log(`Pending hand-written migrations (${pending.length}):`)
    for (const f of pending) console.log(`  - ${f}`)

    if (DRY_RUN) {
      console.log("(dry run — not applying)")
      return
    }

    for (const filename of pending) {
      const path = join(MIGRATIONS_DIR, filename)
      const content = await readFile(path, "utf-8")
      const hash = createHash("sha256").update(content).digest("hex")

      process.stdout.write(`▶ ${filename} ... `)
      try {
        await client.query("BEGIN")
        // Match drizzle-kit's convention: split on `statement-breakpoint`
        // so files containing several DDL statements run as separate
        // queries (the pg driver doesn't accept multi-statement bodies
        // with `$N` placeholders, and some statements need to commit
        // their catalog effect before the next can see it).
        const statements = content
          .split(/-->\s*statement-breakpoint/)
          .map((s) => s.trim())
          .filter(Boolean)
        for (const stmt of statements) {
          await client.query(stmt)
        }
        await client.query(
          `INSERT INTO ${TRACKER_TABLE} (filename, content_hash) VALUES ($1, $2)`,
          [filename, hash],
        )
        await client.query("COMMIT")
        console.log("ok")
      } catch (err) {
        await client.query("ROLLBACK")
        console.log("FAILED")
        throw err
      }
    }

    console.log(`✓ Applied ${pending.length} hand-written migration(s).`)
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
