/**
 * Re-resolve all project records whose website_url is still a PH /r/
 * outbound-tracker. Updates the row with the real URL on success,
 * marks `is_low_quality=true` (and leaves the bad URL in place) on
 * failure so AI cron jobs stop wasting Tinyfish slots on it.
 *
 * Usage:
 *   bun run scripts/resolve-ph-urls.ts            # process all
 *   bun run scripts/resolve-ph-urls.ts --dry-run  # report only, no writes
 *   bun run scripts/resolve-ph-urls.ts --limit 10 # cap at N records
 *
 * Pace: ~0.5s between requests so PH doesn't rate-limit us. With 195
 * records this takes ~2 min total.
 */
import { db } from "@/drizzle/db"
import { project } from "@/drizzle/db/schema"
import { eq, like } from "drizzle-orm"

import { getRealWebsiteUrl } from "@/lib/producthunt"

const REQUEST_INTERVAL_MS = 500

const args = process.argv.slice(2)
const dryRun = args.includes("--dry-run")
const limitIdx = args.indexOf("--limit")
const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : Infinity

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function main() {
  console.log(`Mode: ${dryRun ? "DRY RUN (no writes)" : "LIVE"}`)

  const rows = await db
    .select({
      id: project.id,
      slug: project.slug,
      name: project.name,
      websiteUrl: project.websiteUrl,
    })
    .from(project)
    .where(like(project.websiteUrl, "%producthunt.com/r/%"))

  const toProcess = rows.slice(0, Number.isFinite(limit) ? limit : rows.length)
  console.log(
    `Found ${rows.length} PH-redirect records${rows.length !== toProcess.length ? `, processing ${toProcess.length}` : ""}`,
  )

  let resolved = 0
  let failed = 0
  let duplicate = 0
  let i = 0

  for (const row of toProcess) {
    i++
    process.stdout.write(`[${i}/${toProcess.length}] ${row.name.slice(0, 40).padEnd(40)} ... `)
    const real = await getRealWebsiteUrl(row.websiteUrl)

    if (real && !real.includes("producthunt.com")) {
      // Project websiteUrl has a unique constraint. If the resolved URL
      // is already used by another (older, real) project, we can't take
      // that URL — instead mark this duplicate as low-quality so cron
      // jobs skip it, and leave the /r/ URL in place for ops to inspect.
      if (!dryRun) {
        try {
          await db
            .update(project)
            .set({ websiteUrl: real, updatedAt: new Date() })
            .where(eq(project.id, row.id))
          process.stdout.write(`✓ ${real}\n`)
          resolved++
        } catch (err) {
          const code = (err as { code?: string })?.code
          if (code === "23505") {
            process.stdout.write(`✓ ${real} (duplicate — marking low-quality)\n`)
            duplicate++
            await db
              .update(project)
              .set({ isLowQuality: true, updatedAt: new Date() })
              .where(eq(project.id, row.id))
          } else {
            throw err
          }
        }
      } else {
        process.stdout.write(`✓ ${real}\n`)
        resolved++
      }
    } else {
      process.stdout.write(`✗ unresolved (marking low-quality)\n`)
      failed++
      if (!dryRun) {
        await db
          .update(project)
          .set({ isLowQuality: true, updatedAt: new Date() })
          .where(eq(project.id, row.id))
      }
    }

    await sleep(REQUEST_INTERVAL_MS)
  }

  console.log("")
  console.log(`Resolved:   ${resolved}`)
  console.log(`Duplicate:  ${duplicate} (other project already had the URL — marked low-quality)`)
  console.log(`Failed:     ${failed} (marked is_low_quality=true)`)
  console.log(`Total:      ${toProcess.length}`)
  process.exit(0)
}

main().catch((err) => {
  console.error("Fatal:", err)
  process.exit(1)
})
