/**
 * One-off DR backfill. Fetches Domain Rating for the tracked domains
 * and upserts the cache using the SAME write strategy as the
 * /api/cron/refresh-dr cron (lib/dr → writeDomainDr) — so you can fill
 * in newly-added domains immediately instead of waiting for the 3-day
 * cron tick.
 *
 * Usage:
 *   bun run scripts/backfill-dr.ts                  # all ALL_TRACKED_DOMAINS
 *   bun run scripts/backfill-dr.ts mifar.net qoo.im # only these domains
 *
 * Writes to whatever DATABASE_URL resolves to — point it at the env you
 * intend to fill (prod cache, local copy, …).
 */
import { fetchDomainRating } from "@/lib/ahrefs"
import { ALL_TRACKED_DOMAINS, writeDomainDr } from "@/lib/dr"

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const args = process.argv.slice(2)
const domains = args.length > 0 ? args : [...ALL_TRACKED_DOMAINS]

console.log(`Backfilling DR for ${domains.length} domain(s)...\n`)

let ok = 0
let failed = 0

for (const domain of domains) {
  const result = await fetchDomainRating(domain)
  const stored = await writeDomainDr(result)

  if (stored) {
    ok++
    console.log(
      `  ✓ ${domain.padEnd(26)} DR ${String(result.dr).padStart(3)}  (${result.provider})`,
    )
  } else {
    failed++
    console.log(`  ✗ ${domain.padEnd(26)} ${result.error ?? `no DR (HTTP ${result.httpStatus})`}`)
  }

  // Be gentle on the free public endpoint when sweeping many domains.
  await sleep(500)
}

console.log(`\nDone: ${ok} ok, ${failed} failed (of ${domains.length}).`)
process.exit(0)
