import { db } from "@/drizzle/db"
import { domainDrCache } from "@/drizzle/db/schema"
import { eq, inArray } from "drizzle-orm"

/**
 * Domains tracked by the refresh-dr cron, grouped by Directory tier.
 * Each tier inherits everything in the tiers above it.
 *
 * Adding a domain: append to the right tier and the cron picks it up
 * on the next run (every 3 days). DRs ship as null until first fetch.
 */
export const DR_DOMAINS_BASIC = ["aat.ee"] as const

export const DR_DOMAINS_PLUS = [...DR_DOMAINS_BASIC, "hicyou.com", "mf8.biz", "bigkr.com"] as const

export const DR_DOMAINS_PRO = [
  ...DR_DOMAINS_PLUS,
  "debian.club",
  "ubuntu.fan",
  "almalinux.com.cn",
  "runentlinux.com",
  "eol.wiki",
  "rank.fan",
  "litehttpd.com",
  "portcyou.com",
] as const

export const ALL_TRACKED_DOMAINS = DR_DOMAINS_PRO

// A DR value is considered fresh for this many ms. Past this it
// still renders (with a "Updated X days ago" hint) but the cron
// will refresh on its next 3-day tick.
const FRESH_WINDOW_MS = 3 * 24 * 60 * 60 * 1000

export interface DRRecord {
  domain: string
  dr: number | null
  fetchedAt: Date | null
  isFresh: boolean
}

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
