#!/usr/bin/env bun
/**
 * Cleans up orphan rows in the fuma-comment tables.
 *
 * Background: fuma_comments.author / fuma_rates.user_id historically had no
 * foreign keys, so deleted users left their comments and likes behind, and
 * hard-deleted comments left fuma_rates rows pointing at them. Migration
 * 0050 adds the FKs NOT VALID; this script removes the historical orphans
 * so the constraints can be VALIDATEd afterwards.
 *
 * Orphans handled:
 *   1. fuma_rates rows whose user_id has no user          -> DELETE
 *   2. fuma_rates rows whose comment_id has no comment    -> DELETE
 *   3. fuma_comments rows whose thread has no parent      -> thread = NULL
 *      (reply becomes a root; mirrors the ON DELETE SET NULL FK)
 *   4. fuma_comments rows whose author has no user        -> anonymize
 *      (author rewritten to a stable tombstone id, content left intact)
 *
 * Usage:
 *   bun scripts/ops/cleanup-comment-orphans.ts              dry-run (default)
 *   bun scripts/ops/cleanup-comment-orphans.ts --apply      apply changes
 *   bun scripts/ops/cleanup-comment-orphans.ts --env=.env.production
 */
import * as dotenv from "dotenv"

const args = process.argv.slice(2)
const envFile = args.find((a) => a.startsWith("--env="))?.slice("--env=".length) ?? ".env.local"
const apply = args.includes("--apply")

dotenv.config({ path: envFile })

const { db } = await import("../../drizzle/db")
const { sql } = await import("drizzle-orm")

// Stable tombstone author id for comments whose author was deleted. Not a
// real user id; the UI renders whatever name the fuma client resolves for
// unknown authors, and the bot-only partial unique index is unaffected
// (it only matches `bot-user-%`).
const TOMBSTONE_AUTHOR = "deleted-user"

async function countOrphans(): Promise<{
  ratesMissingUser: number
  ratesMissingComment: number
  commentsMissingThread: number
  commentsMissingAuthor: number
}> {
  const res = await db.execute<{
    rates_missing_user: number
    rates_missing_comment: number
    comments_missing_thread: number
    comments_missing_author: number
  }>(sql`
    SELECT
      (SELECT count(*) FROM fuma_rates r WHERE NOT EXISTS (SELECT 1 FROM "user" u WHERE u.id = r.user_id))::int AS rates_missing_user,
      (SELECT count(*) FROM fuma_rates r WHERE NOT EXISTS (SELECT 1 FROM fuma_comments c WHERE c.id = r.comment_id))::int AS rates_missing_comment,
      (SELECT count(*) FROM fuma_comments c WHERE c.thread IS NOT NULL AND NOT EXISTS (SELECT 1 FROM fuma_comments p WHERE p.id = c.thread))::int AS comments_missing_thread,
      (SELECT count(*) FROM fuma_comments c WHERE c.author <> ${TOMBSTONE_AUTHOR} AND c.author NOT LIKE 'bot-user-%' AND NOT EXISTS (SELECT 1 FROM "user" u WHERE u.id = c.author))::int AS comments_missing_author
  `)
  const r = res.rows[0]
  return {
    ratesMissingUser: r.rates_missing_user,
    ratesMissingComment: r.rates_missing_comment,
    commentsMissingThread: r.comments_missing_thread,
    commentsMissingAuthor: r.comments_missing_author,
  }
}

async function main() {
  console.log(`Mode: ${apply ? "APPLY" : "DRY-RUN"} (env: ${envFile})`)
  const before = await countOrphans()
  console.log("Orphans found:", before)

  if (!apply) {
    console.log("\nDry-run only. Re-run with --apply to make the changes:")
    console.log(
      "  DELETE fuma_rates missing user/comment, NULL out dangling threads, anonymize missing authors.",
    )
    process.exit(0)
  }

  await db.transaction(async (tx) => {
    await tx.execute(sql`
      DELETE FROM fuma_rates r
      WHERE NOT EXISTS (SELECT 1 FROM "user" u WHERE u.id = r.user_id)
         OR NOT EXISTS (SELECT 1 FROM fuma_comments c WHERE c.id = r.comment_id)
    `)
    await tx.execute(sql`
      UPDATE fuma_comments c SET thread = NULL
      WHERE c.thread IS NOT NULL AND NOT EXISTS (SELECT 1 FROM fuma_comments p WHERE p.id = c.thread)
    `)
    await tx.execute(sql`
      UPDATE fuma_comments c SET author = ${TOMBSTONE_AUTHOR}
      WHERE c.author <> ${TOMBSTONE_AUTHOR}
        AND c.author NOT LIKE 'bot-user-%'
        AND NOT EXISTS (SELECT 1 FROM "user" u WHERE u.id = c.author)
    `)
  })

  const after = await countOrphans()
  console.log("Orphans after cleanup:", after)
  console.log(
    "\nDone. You can now VALIDATE the 0050 constraints (see the migration header for SQL).",
  )
  process.exit(0)
}

main().catch((err) => {
  console.error("Cleanup failed:", err)
  process.exit(1)
})
