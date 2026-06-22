import { drByDomain, drUpdatedAt } from "@/lib/directories-links"
import { FRESH_WINDOW_MS, type DRRecord } from "@/lib/dr-domains"

// Re-export the pure-data constants + type so existing server-side
// callers that did `import { DR_DOMAINS_PRO, getDRBatch } from "@/lib/dr"`
// keep working without churn. Client components should import directly
// from `lib/dr-domains` to avoid pulling the snapshot into the browser bundle.
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
 * DR values now come from the build-time `directories-links` snapshot
 * (lib/directories-links.ts), not a live Ahrefs fetch / DB cache — the
 * upstream repo refreshes DR daily and we embed the latest at build time.
 * Returns one entry per requested domain, in order; a domain absent from the
 * snapshot comes back with dr=null so the UI can render a placeholder.
 */
export async function getDRBatch(domains: readonly string[]): Promise<DRRecord[]> {
  if (domains.length === 0) return []
  const fetchedAt = drUpdatedAt
  const windowFresh = fetchedAt ? Date.now() - fetchedAt.getTime() < FRESH_WINDOW_MS : true
  return domains.map((domain) => {
    const dr = drByDomain.get(domain) ?? null
    return { domain, dr, fetchedAt, isFresh: dr != null && windowFresh }
  })
}

/**
 * Single-domain convenience wrapper. Same shape as one element of getDRBatch.
 */
export async function getDR(domain: string): Promise<DRRecord> {
  const [record] = await getDRBatch([domain])
  return record
}
