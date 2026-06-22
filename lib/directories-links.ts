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

// domain → DR across every site — the DR source for /pricing, footer, etc.
export const drByDomain: ReadonlyMap<string, number> = new Map(
  [...(d.footer_navigation_sites ?? []), ...(d.authority_documentation_sites ?? [])]
    .filter((s) => typeof s.dr === "number")
    .map((s) => [s.domain, s.dr as number]),
)

export const drUpdatedAt: Date | null = d._dr_update_meta?.last_run_at
  ? new Date(d._dr_update_meta.last_run_at)
  : null

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
