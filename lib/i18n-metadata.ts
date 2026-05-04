import { routing } from "@/i18n/routing"

const baseUrl = process.env.NEXT_PUBLIC_URL || "https://www.aat.ee"

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
