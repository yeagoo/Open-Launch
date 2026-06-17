import { db } from "@/drizzle/db"
import { domainDrCache } from "@/drizzle/db/schema"
import { eq, inArray, sql } from "drizzle-orm"

import type { FetchDrResult } from "@/lib/ahrefs"
import { FRESH_WINDOW_MS, type DRRecord } from "@/lib/dr-domains"

// Re-export the pure-data constants + type so existing server-side
// callers that did `import { DR_DOMAINS_PRO, getDRBatch } from "@/lib/dr"`
// keep working without churn. Client components should import directly
// from `lib/dr-domains` to avoid pulling pg into the browser bundle.
export {
  ALL_TRACKED_DOMAINS,
  DR_DOMAINS_BASIC,
  DR_DOMAINS_PLUS,
  DR_DOMAINS_PRO,
  DR_DOMAINS_PRO_PREVIEW,
  type DRRecord,
  FRESH_WINDOW_MS,
} from "@/lib/dr-domains"

/**
 * Read DR values for the given domain list out of the cache. Returns
 * one entry per requested domain in the order requested. Domains
 * absent from the cache come back with dr=null/fetchedAt=null/
 * isFresh=false — UI should render a placeholder for those.
 */
export async function getDRBatch(domains: readonly string[]): Promise<DRRecord[]> {
  if (domains.length === 0) return []
  const rows = await db
    .select({
      domain: domainDrCache.domain,
      dr: domainDrCache.dr,
      fetchedAt: domainDrCache.fetchedAt,
    })
    .from(domainDrCache)
    .where(inArray(domainDrCache.domain, [...domains]))

  const byDomain = new Map(rows.map((r) => [r.domain, r]))
  const now = Date.now()
  return domains.map((d) => {
    const row = byDomain.get(d)
    const fetchedAt = row?.fetchedAt ?? null
    return {
      domain: d,
      dr: row?.dr ?? null,
      fetchedAt,
      isFresh: fetchedAt ? now - fetchedAt.getTime() < FRESH_WINDOW_MS : false,
    }
  })
}

/**
 * Upsert one fetch result into `domain_dr_cache`. Shared by the
 * refresh-dr cron and the backfill script so the write strategy lives
 * in one place:
 *   - Success → overwrite dr / fetched_at / source / raw / clear error.
 *   - Failure → bump last_attempt_at + last_error only; keep the last
 *     good dr / fetched_at / source so the UI still renders stale data.
 * Returns true when a DR value was stored.
 */
export async function writeDomainDr(result: FetchDrResult): Promise<boolean> {
  const now = new Date()

  if (result.dr !== null && result.provider) {
    await db
      .insert(domainDrCache)
      .values({
        domain: result.domain,
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
    return true
  }

  const errMsg = (result.error ?? `provider returned no DR (HTTP ${result.httpStatus})`).slice(
    0,
    500,
  )
  await db
    .insert(domainDrCache)
    .values({
      domain: result.domain,
      lastAttemptAt: now,
      lastError: errMsg,
      httpStatus: result.httpStatus,
    })
    .onConflictDoUpdate({
      target: domainDrCache.domain,
      set: {
        lastAttemptAt: now,
        lastError: errMsg,
        httpStatus: result.httpStatus,
        // Preserve prior good values for the stale-data UI.
        dr: sql`${domainDrCache.dr}`,
        fetchedAt: sql`${domainDrCache.fetchedAt}`,
        source: sql`${domainDrCache.source}`,
      },
    })
  return false
}

/**
 * Single-domain convenience wrapper. Same shape as one element of
 * getDRBatch.
 */
export async function getDR(domain: string): Promise<DRRecord> {
  const [row] = await db
    .select({
      domain: domainDrCache.domain,
      dr: domainDrCache.dr,
      fetchedAt: domainDrCache.fetchedAt,
    })
    .from(domainDrCache)
    .where(eq(domainDrCache.domain, domain))
    .limit(1)

  const fetchedAt = row?.fetchedAt ?? null
  return {
    domain,
    dr: row?.dr ?? null,
    fetchedAt,
    isFresh: fetchedAt ? Date.now() - fetchedAt.getTime() < FRESH_WINDOW_MS : false,
  }
}
