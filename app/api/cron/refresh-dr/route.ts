import { NextRequest, NextResponse } from "next/server"

import { fetchDomainRating } from "@/lib/ahrefs"
import { verifyCronAuth } from "@/lib/cron-auth"
import { cronStatusFromResult } from "@/lib/cron-status"
import { ALL_TRACKED_DOMAINS, writeDomainDr } from "@/lib/dr"

export const dynamic = "force-dynamic"
// ~39 tracked domains (directory + authority networks). The free
// Ahrefs endpoint is fast, but a small inter-request delay keeps us
// well under any rate limit; budget generously so the whole sweep
// completes in one invocation.
export const maxDuration = 300

const INTER_REQUEST_DELAY_MS = 250
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Refresh the DR cache for every tracked domain. Runs every 3 days
 * via the cron dispatcher. Always upserts the row even on failure
 * so the operator can see in `domain_dr_cache.last_error` what went
 * wrong without tailing logs.
 *
 * Cache write strategy:
 *   - Success → update dr, fetched_at, source, raw_response.
 *   - Failure → bump last_attempt_at + last_error only; keeps the
 *     last good DR + fetched_at so the UI can still render with a
 *     stale-data tooltip.
 */
export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request)
  if (authError) return authError

  let refreshed = 0
  let failed = 0
  const errors: string[] = []

  for (const domain of ALL_TRACKED_DOMAINS) {
    const result = await fetchDomainRating(domain)
    const stored = await writeDomainDr(result)

    if (stored) {
      refreshed++
    } else {
      failed++
      errors.push(
        `${domain}: ${result.error ?? `provider returned no DR (HTTP ${result.httpStatus})`}`,
      )
    }

    await sleep(INTER_REQUEST_DELAY_MS)
  }

  const status = cronStatusFromResult({ errorCount: failed, successCount: refreshed })
  return NextResponse.json(
    {
      domains: ALL_TRACKED_DOMAINS.length,
      refreshed,
      failed,
      errors: errors.slice(0, 10),
    },
    { status },
  )
}
