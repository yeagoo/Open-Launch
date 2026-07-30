export const MATOMO_BASE_URL = "https://analytics.hicyou.de/"
export const MATOMO_SITE_ID = "24"

export function getMatomoPageUrl(currentUrl: string): string {
  const url = new URL(currentUrl)
  // Analytics only needs the route. An explicit denylist can never cover every
  // future free-text or provider callback parameter, and URL fragments can
  // contain the same sensitive values without ever reaching the server.
  url.search = ""
  url.hash = ""
  return url.toString()
}
