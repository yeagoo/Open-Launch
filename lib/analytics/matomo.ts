export const MATOMO_BASE_URL = "https://analytics.hicyou.de/"
export const MATOMO_SITE_ID = "24"

export const MATOMO_SENSITIVE_QUERY_PARAMETERS = [
  "code",
  "dir_order",
  "session_id",
  "state",
  "token",
] as const

const sensitiveQueryParameters = new Set<string>(MATOMO_SENSITIVE_QUERY_PARAMETERS)

export function getMatomoPageUrl(currentUrl: string): string {
  const url = new URL(currentUrl)

  for (const parameter of Array.from(url.searchParams.keys())) {
    if (sensitiveQueryParameters.has(parameter.toLowerCase())) {
      url.searchParams.delete(parameter)
    }
  }

  return url.toString()
}
