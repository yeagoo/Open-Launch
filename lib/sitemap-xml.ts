import { routing } from "@/i18n/routing"

export type SitemapChangeFrequency =
  "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never"

export interface SitemapEntry {
  url: string
  // `unstable_cache` JSON-serializes Date values before returning a cache hit.
  // Keep the serialized shape valid instead of assuming every caller still
  // holds the original Date instance.
  lastModified?: Date | string
  changeFrequency?: SitemapChangeFrequency
  priority?: number
  alternates?: Record<string, string>
}

export const SITEMAP_KINDS = [
  "static",
  "projects",
  "tags",
  "blog",
  "reviews",
  "users",
  "editorial",
] as const
export type SitemapKind = (typeof SITEMAP_KINDS)[number]

export const SHARDED_SITEMAP_KINDS = ["projects", "users"] as const
export type ShardedSitemapKind = (typeof SHARDED_SITEMAP_KINDS)[number]

// A source row expands to one URL per locale, with every hreflang alternate
// repeated on each URL. The route caches only these bounded source rows, then
// expands them after the Data Cache read so long slugs cannot overflow Next.js'
// 2 MiB per-item cache limit.
export const SITEMAP_SOURCE_ROWS_PER_SHARD = 250
const MAX_SITEMAP_SHARDS = 1000

export interface SitemapRoute {
  kind: SitemapKind
  shard: number
}

export interface SitemapShardCounts {
  projects: number
  users: number
}

export function parseSitemapRoute(rawKind: string): SitemapRoute | null {
  if (!rawKind.endsWith(".xml")) return null
  const stem = rawKind.slice(0, -4)

  // The legacy unsuffixed projects/users routes redirect to the complete
  // sitemap index. Treating either as shard 1 would hide later shards from a
  // crawler that still has the old URL on file.
  if (SHARDED_SITEMAP_KINDS.includes(stem as ShardedSitemapKind)) return null

  if (SITEMAP_KINDS.includes(stem as SitemapKind)) {
    return { kind: stem as SitemapKind, shard: 1 }
  }

  const match = /^(projects|users)-([1-9]\d*)$/.exec(stem)
  if (!match) return null
  const shard = Number(match[2])
  if (!Number.isSafeInteger(shard) || shard > MAX_SITEMAP_SHARDS) return null

  return { kind: match[1] as ShardedSitemapKind, shard }
}

export function getSitemapIndexPaths(counts: SitemapShardCounts): string[] {
  return SITEMAP_KINDS.flatMap((kind) => {
    if (!SHARDED_SITEMAP_KINDS.includes(kind as ShardedSitemapKind)) return [kind]

    const sourceRows = counts[kind as ShardedSitemapKind]
    const shardCount = Math.max(1, Math.ceil(sourceRows / SITEMAP_SOURCE_ROWS_PER_SHARD))
    return Array.from({ length: shardCount }, (_, index) => `${kind}-${index + 1}`)
  })
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

export function getSitemapBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_URL || "https://www.aat.ee"
  return new URL(configured).origin
}

export function localizedSitemapEntries(
  pathname: string,
  options: Omit<SitemapEntry, "url" | "alternates"> = {},
): SitemapEntry[] {
  const baseUrl = getSitemapBaseUrl()
  const path = pathname === "/" ? "" : pathname
  const alternates: Record<string, string> = {}

  for (const locale of routing.locales) {
    alternates[locale] =
      locale === routing.defaultLocale ? `${baseUrl}${path || "/"}` : `${baseUrl}/${locale}${path}`
  }
  alternates["x-default"] = `${baseUrl}${path || "/"}`

  return routing.locales.map((locale) => ({
    ...options,
    url: alternates[locale],
    alternates,
  }))
}

export function englishSitemapEntry(
  pathname: string,
  options: Omit<SitemapEntry, "url" | "alternates"> = {},
): SitemapEntry {
  const baseUrl = getSitemapBaseUrl()
  return {
    ...options,
    url: `${baseUrl}${pathname === "/" ? "" : pathname}`,
  }
}

export function serializeSitemap(entries: SitemapEntry[]): string {
  const urls = entries
    .map((entry) => {
      const alternates = Object.entries(entry.alternates ?? {})
        .map(
          ([language, href]) =>
            `<xhtml:link rel="alternate" hreflang="${escapeXml(language)}" href="${escapeXml(href)}" />`,
        )
        .join("")
      const lastModified = entry.lastModified
        ? new Date(entry.lastModified).toISOString()
        : undefined
      return [
        "<url>",
        `<loc>${escapeXml(entry.url)}</loc>`,
        lastModified ? `<lastmod>${lastModified}</lastmod>` : "",
        entry.changeFrequency ? `<changefreq>${entry.changeFrequency}</changefreq>` : "",
        entry.priority === undefined ? "" : `<priority>${entry.priority.toFixed(1)}</priority>`,
        alternates,
        "</url>",
      ].join("")
    })
    .join("")

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    urls,
    "</urlset>",
  ].join("")
}

export function serializeSitemapIndex(paths: readonly string[]): string {
  const baseUrl = getSitemapBaseUrl()
  const entries = paths
    .map((path) => `<sitemap><loc>${escapeXml(`${baseUrl}/sitemaps/${path}.xml`)}</loc></sitemap>`)
    .join("")

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    entries,
    "</sitemapindex>",
  ].join("")
}
