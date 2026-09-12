import { getPathname } from "@/i18n/navigation"
import type { Locale } from "@/i18n/routing"

/**
 * Builds a locale-switch URL from next-intl's logical pathname.
 *
 * `forcePrefix` is deliberate even for the default locale. Visiting `/en/...`
 * lets next-intl update `NEXT_LOCALE` before it redirects to the canonical
 * unprefixed English URL. Without it, a previous non-default locale cookie can
 * redirect an attempted English switch straight back to that old locale.
 */
export function getLocaleSwitchTarget(
  pathname: string | null,
  search: string,
  locale: Locale,
): string {
  const targetPathname = getPathname({
    href: pathname || "/",
    locale,
    forcePrefix: true,
  })

  return search ? `${targetPathname}?${search}` : targetPathname
}
