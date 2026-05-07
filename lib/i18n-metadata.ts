import { routing } from "@/i18n/routing"

const baseUrl = process.env.NEXT_PUBLIC_URL || "https://www.aat.ee"

// next-intl locale code → BCP-47 locale tag used by Open Graph + Schema.org.
// Pick the most-recognized region for each language so social platforms render
// content in the right script/variant when users share localized URLs.
const OG_LOCALE_MAP = {
  en: "en_US",
  zh: "zh_CN",
  es: "es_ES",
  pt: "pt_BR",
  fr: "fr_FR",
  ja: "ja_JP",
  ko: "ko_KR",
  et: "et_EE",
} as const

export type RoutingLocale = (typeof routing.locales)[number]

/**
 * Generate canonical + hreflang alternates for a localized route.
 *
 * @param pathname Path WITHOUT locale prefix (e.g. "/friends", "/projects/foo", "/")
 * @param locale   Current locale of the page being rendered
 */
export function buildLocaleAlternates(pathname: string, locale: string) {
  const path = pathname === "/" ? "" : pathname
  const languages: Record<string, string> = {}
  for (const loc of routing.locales) {
    languages[loc] =
      loc === routing.defaultLocale ? `${baseUrl}${path}` : `${baseUrl}/${loc}${path}`
  }
  languages["x-default"] = `${baseUrl}${path}`

  const canonical =
    locale === routing.defaultLocale ? `${baseUrl}${path || "/"}` : `${baseUrl}/${locale}${path}`

  return { canonical, languages }
}

/**
 * Resolve the canonical URL for a localized route (without computing the full
 * alternates map). Useful for OG/Twitter `url` fields.
 */
export function buildLocaleCanonical(pathname: string, locale: string): string {
  const path = pathname === "/" ? "" : pathname
  return locale === routing.defaultLocale
    ? `${baseUrl}${path || "/"}`
    : `${baseUrl}/${locale}${path}`
}

/**
 * Map a routing locale (e.g. "zh") to its BCP-47 OG locale tag (e.g. "zh_CN").
 */
export function ogLocaleFor(locale: string): string {
  return OG_LOCALE_MAP[locale as RoutingLocale] ?? OG_LOCALE_MAP.en
}

/**
 * Return the openGraph fields a localized page should override:
 *   - locale: current page's BCP-47 tag
 *   - alternateLocale: every other locale's BCP-47 tag (Facebook needs both)
 *   - url: canonical URL for the current locale of the given path
 */
export function buildLocaleOpenGraph(pathname: string, locale: string) {
  const ogLocale = ogLocaleFor(locale)
  const alternateLocale = routing.locales.filter((l) => l !== locale).map(ogLocaleFor)
  return {
    locale: ogLocale,
    alternateLocale,
    url: buildLocaleCanonical(pathname, locale),
  }
}

/**
 * Metadata fields for pages that exist under [locale]/ for routing reasons but
 * should NOT be indexed as multilingual content (e.g. legal text where
 * machine-translated copy carries legal risk). Forces:
 *   - canonical pointing to the un-prefixed (English) URL regardless of which
 *     locale was visited
 *   - openGraph.locale = en_US
 *   - no hreflang map (Google should treat all locale-prefixed visits as the
 *     same English document)
 */
export function buildEnglishOnlyAlternates(pathname: string) {
  const path = pathname === "/" ? "" : pathname
  return { canonical: `${baseUrl}${path || "/"}` }
}

export function buildEnglishOnlyOpenGraph(pathname: string) {
  const path = pathname === "/" ? "" : pathname
  return {
    locale: "en_US",
    url: `${baseUrl}${path || "/"}`,
  }
}
