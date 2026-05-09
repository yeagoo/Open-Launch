import { NextRequest, NextResponse } from "next/server"

import { db } from "@/drizzle/db"
import { domainDrCache } from "@/drizzle/db/schema"
import { sql } from "drizzle-orm"

import { fetchDomainRating } from "@/lib/ahrefs"
import { verifyCronAuth } from "@/lib/cron-auth"
import { cronStatusFromResult } from "@/lib/cron-status"
import { ALL_TRACKED_DOMAINS } from "@/lib/dr"

export const dynamic = "force-dynamic"
// 12 domains × ~5s/domain worst case = 60s. Keep slack.
export const maxDuration = 120

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
    const now = new Date()

    if (result.dr !== null && result.provider) {
      await db
        .insert(domainDrCache)
        .values({
          domain,
          dr: result.dr,
          fetchedAt: now,
          lastAttemptAt: now,
          source: result.provider,
          httpStatus: result.httpStatus,
          rawResponse: result.raw as never,
          lastError: null,
        })
        .onConflictDoUpdate({
          target: domainDrCache.domain,
          set: {
            dr: result.dr,
            fetchedAt: now,
            lastAttemptAt: now,
            source: result.provider,
            httpStatus: result.httpStatus,
            rawResponse: result.raw as never,
            lastError: null,
          },
        })
      refreshed++
      continue
    }

    failed++
    const errMsg = result.error ?? `provider returned no DR (HTTP ${result.httpStatus})`
    errors.push(`${domain}: ${errMsg}`)
    // Preserve previously-cached dr / fetched_at if any. Use sql
    // EXCLUDED-style references in onConflictDoUpdate so we only
    // touch attempt + error columns.
    await db
      .insert(domainDrCache)
      .values({
        domain,
        lastAttemptAt: now,
        lastError: errMsg.slice(0, 500),
        httpStatus: result.httpStatus,
      })
      .onConflictDoUpdate({
        target: domainDrCache.domain,
        set: {
          lastAttemptAt: now,
          lastError: errMsg.slice(0, 500),
          httpStatus: result.httpStatus,
          // Do NOT clobber dr / fetchedAt / source — leave previous
          // good values in place for the stale-data UI.
          dr: sql`${domainDrCache.dr}`,
          fetchedAt: sql`${domainDrCache.fetchedAt}`,
          source: sql`${domainDrCache.source}`,
        },
      })
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
