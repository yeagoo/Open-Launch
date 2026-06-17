/**
 * Pure data — domain lists + DR record type. Lives in its own
 * module (no DB imports) so client components can pull the
 * constants without webpack dragging `pg` and friends into the
 * browser bundle. Server-side helpers (`getDRBatch`, `getDR`) live
 * in `lib/dr.ts` and re-export these constants for convenience.
 *
 * Adding a domain: append to the right tier and the refresh-dr
 * cron picks it up on the next 3-day tick. DRs ship as `null`
 * until the first fetch lands.
 */

import { AUTHORITY_NETWORK_DOMAINS, DIRECTORY_NETWORK_DOMAINS } from "@/lib/site-network"

// Typed as `readonly string[]` (not narrow tuple literals) so
// callers can `.includes(someString)` without casting. The arrays
// themselves are still frozen at runtime via the `as const` on the
// initialiser.
export const DR_DOMAINS_BASIC: readonly string[] = ["aat.ee"] as const

export const DR_DOMAINS_PLUS: readonly string[] = [
  ...DR_DOMAINS_BASIC,
  "hicyou.com",
  "mf8.biz",
  "bigkr.com",
] as const

export const DR_DOMAINS_PRO: readonly string[] = [
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

// Every domain the refresh-dr cron fetches: the legacy Pro display set
// plus the full directory + authority networks (lib/site-network.ts),
// deduped (several network domains already appear in DR_DOMAINS_PRO).
// Deliberately separate from the DR_DOMAINS_* display tiers — expanding
// what we *track* must never change what the v1 /pricing page *shows*.
export const ALL_TRACKED_DOMAINS: readonly string[] = Array.from(
  new Set<string>([...DR_DOMAINS_PRO, ...DIRECTORY_NETWORK_DOMAINS, ...AUTHORITY_NETWORK_DOMAINS]),
)

// Three docs sites featured inline on the Pro/Ultra tier cards.
// The other nine sites (4 directories + 5 docs) live behind a
// hover-revealed overflow pill so the card stays scannable. Keep
// in sync with marketing copy in /pricing.
export const DR_DOMAINS_PRO_PREVIEW: readonly string[] = [
  "debian.club",
  "portcyou.com",
  "rank.fan",
] as const

// A DR value is considered fresh for this many ms. Past this it
// still renders (with a "Updated X days ago" hint) but the cron
// will refresh on its next 3-day tick.
export const FRESH_WINDOW_MS = 3 * 24 * 60 * 60 * 1000

export interface DRRecord {
  domain: string
  dr: number | null
  fetchedAt: Date | null
  isFresh: boolean
}
