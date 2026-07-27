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

export function serializeSitemapIndex(): string {
  const baseUrl = getSitemapBaseUrl()
  const entries = SITEMAP_KINDS.map(
    (kind) => `<sitemap><loc>${escapeXml(`${baseUrl}/sitemaps/${kind}.xml`)}</loc></sitemap>`,
  ).join("")

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    entries,
    "</sitemapindex>",
  ].join("")
}
