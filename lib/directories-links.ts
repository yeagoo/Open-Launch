// Typed accessors over the build-time snapshot of the directories-links repo
// (refreshed by scripts/sync-directories-links.ts). Single source of truth for
// the footer nav links, the /friends page, and the DR values shown on /pricing.
//
// NOTE: importing this pulls the full ~138KB snapshot into whatever bundle uses
// it. Keep it to SERVER code (RSC pages, lib/dr, the root layout). The client
// footer receives a small serialized slice (`footerNavSites`) as props instead.
import data from "./directories-links.json"

export type FriendSiteStatus = "active" | "pending_dns" | "unreachable" | "archived"

export interface FriendSite {
  id: string
  name: string
  domain: string
  url: string
  category: string
  status: FriendSiteStatus
  dr: number | null
  dr_last_checked_at: string | null
  logo_svg: string | null
  description: string | null
  description_i18n: Record<string, string>
}

interface LinkData {
  schema_version: number
  footer_navigation_sites: FriendSite[]
  authority_documentation_sites: FriendSite[]
  all_friend_links: FriendSite[]
  _dr_update_meta?: { last_run_at?: string }
  i18n?: Record<string, Record<string, string>>
}

const d = data as unknown as LinkData

// Hide archived entries everywhere (per the repo's rendering rules).
const visible = (s: FriendSite) => s.status !== "archived"

export const footerNavigationSites: FriendSite[] = (d.footer_navigation_sites ?? []).filter(visible)
export const authorityDocumentationSites: FriendSite[] = (
  d.authority_documentation_sites ?? []
).filter(visible)
export const allFriendLinks: FriendSite[] = (d.all_friend_links ?? []).filter(visible)

export interface DrInfo {
  dr: number | null
  // Per-domain "DR last checked" date from the upstream rotation. Use this
  // (not a single global last-run) so freshness reflects each domain — the
  // upstream only re-checks a few domains per day.
  checkedAt: Date | null
}

// domain → DR info across every site — the DR source for /pricing, footer, etc.
export const drByDomain: ReadonlyMap<string, DrInfo> = new Map(
  [...(d.footer_navigation_sites ?? []), ...(d.authority_documentation_sites ?? [])].map((s) => [
    s.domain,
    {
      dr: typeof s.dr === "number" ? s.dr : null,
      checkedAt: s.dr_last_checked_at ? new Date(s.dr_last_checked_at) : null,
    },
  ]),
)

// Our app locale → the snapshot's locale key (descriptions + section titles).
const LOCALE_MAP: Record<string, string> = {
  en: "en-US",
  zh: "zh-CN",
  es: "es-ES",
  pt: "pt-PT",
  fr: "fr-FR",
  ja: "ja-JP",
  ko: "ko-KR",
  et: "et-EE",
}

export function siteDescription(site: FriendSite, locale: string): string {
  const key = LOCALE_MAP[locale] ?? "en-US"
  return site.description_i18n?.[key] ?? site.description_i18n?.["en-US"] ?? site.description ?? ""
}

export function sectionTitle(
  group: "footer_navigation_sites_title" | "authority_documentation_sites_title",
  locale: string,
): string {
  const key = LOCALE_MAP[locale] ?? "en-US"
  return d.i18n?.[key]?.[group] ?? d.i18n?.["en-US"]?.[group] ?? group
}

// Upstream "/assets/logos/x.svg" → our mirrored "/partner-logos/x.svg".
export function logoUrl(site: { logo_svg: string | null }): string | null {
  if (!site.logo_svg) return null
  const name = site.logo_svg.split("/").pop()
  return name ? `/partner-logos/${name}` : null
}

// Small, serializable slice for the client footer (avoids bundling the full
// snapshot into the client). Passed as a prop from the server root layout.
export interface FooterNavSite {
  name: string
  url: string
  domain: string
  logo: string | null
  deemphasized: boolean
}

export const footerNavSites: FooterNavSite[] = footerNavigationSites.map((s) => ({
  name: s.name,
  url: s.url,
  domain: s.domain,
  logo: logoUrl(s),
  // De-emphasize sites the upstream flags as not-currently-reachable.
  deemphasized: s.status === "pending_dns" || s.status === "unreachable",
}))

export interface PromoDirectorySite {
  name: string
  domain: string
  logo: string | null
  dr: number | null
}

/**
 * The highest-DR directories to showcase in the home "get listed in N
 * directories" promo, always including aat.ee. Built from the live snapshot so
 * the lineup tracks DR as the upstream refreshes it, rather than a hardcoded
 * list that goes stale.
 *
 * Rule: take the top active sites by DR, then guarantee aat.ee is present — if
 * it didn't make the cut (or isn't in the snapshot at all) it's injected via a
 * static fallback, replacing the lowest-DR pick so the count is preserved.
 * Returns up to `count` sites (fewer only if the snapshot has fewer than
 * `count - 1` other active sites), always sorted DR-desc with aat.ee included.
 */
export function promoDirectorySites(count: number): PromoDirectorySite[] {
  if (count <= 0) return []

  const toPromo = (s: FriendSite): PromoDirectorySite => ({
    name: s.name,
    domain: s.domain,
    logo: logoUrl(s),
    dr: typeof s.dr === "number" ? s.dr : null,
  })

  const seen = new Set<string>()
  const active = [...footerNavigationSites, ...authorityDocumentationSites]
    .filter((s) => s.status === "active")
    .filter((s) => (seen.has(s.domain) ? false : (seen.add(s.domain), true)))
    .sort((a, b) => (b.dr ?? -1) - (a.dr ?? -1))

  const picked = active.slice(0, count).map(toPromo)

  // Guarantee aat.ee — it's our own domain, so fall back to a static entry if
  // the snapshot somehow lacks it or marks it inactive.
  if (!picked.some((s) => s.domain === "aat.ee")) {
    const aatSite = active.find((s) => s.domain === "aat.ee")
    const aat: PromoDirectorySite = aatSite
      ? toPromo(aatSite)
      : { name: "aat.ee", domain: "aat.ee", logo: "/partner-logos/aat-ee.svg", dr: null }
    // Replace the lowest-DR pick (keeps the count) when the list is already
    // full; otherwise just append.
    if (picked.length >= count) picked[picked.length - 1] = aat
    else picked.push(aat)
  }

  return picked
}
