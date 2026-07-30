// Pure syndication policy shared by the runtime worker and standalone
// operational tooling. Keep this module free of database and Next.js imports.

export const SYNDICATION_SITES = ["bigkr", "mf8", "hicyou", "toolso"] as const
export type SyndicationSite = (typeof SYNDICATION_SITES)[number]

export const SYNDICATED_TIERS: ReadonlySet<string> = new Set(["plus", "pro", "ultra", "ultraPlus"])
export const SYNDICATION_MAX_ATTEMPTS = 8
export const SYNDICATION_STALE_CLAIM_MINUTES = 10

const SITE_URL_ENV: Record<SyndicationSite, string> = {
  bigkr: "SYNDICATION_BIGKR_URL",
  mf8: "SYNDICATION_MF8_URL",
  hicyou: "SYNDICATION_HICYOU_URL",
  toolso: "SYNDICATION_TOOLSO_URL",
}

const SITE_KEY_ENV: Record<SyndicationSite, string> = {
  bigkr: "SYNDICATION_BIGKR_API_KEY",
  mf8: "SYNDICATION_MF8_API_KEY",
  hicyou: "SYNDICATION_HICYOU_API_KEY",
  toolso: "SYNDICATION_TOOLSO_API_KEY",
}

export function siteEndpointEnvironmentName(site: SyndicationSite): string {
  return SITE_URL_ENV[site]
}

export function siteApiKeyEnvironmentName(site: SyndicationSite): string {
  return SITE_KEY_ENV[site]
}

export function siteEndpoint(
  site: SyndicationSite,
  environment: Readonly<Record<string, string | undefined>> = process.env,
): string | null {
  return environment[SITE_URL_ENV[site]]?.trim() || null
}

export function siteApiKey(
  site: SyndicationSite,
  environment: Readonly<Record<string, string | undefined>> = process.env,
): string | null {
  return (
    environment[SITE_KEY_ENV[site]]?.trim() || environment.EXTERNAL_LAUNCH_API_KEY?.trim() || null
  )
}

export function findSyndicationConfigurationIssues(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): string[] {
  const issues: string[] = []
  for (const site of SYNDICATION_SITES) {
    const endpoint = siteEndpoint(site, environment)
    if (!endpoint) {
      issues.push(`${site}: ${siteEndpointEnvironmentName(site)} is not configured`)
    } else {
      try {
        const url = new URL(endpoint)
        if (
          url.protocol !== "https:" ||
          url.username ||
          url.password ||
          url.pathname !== "/api/external/launch" ||
          url.search ||
          url.hash
        ) {
          issues.push(`${site}: endpoint must be a credential-free HTTPS /api/external/launch URL`)
        }
      } catch {
        issues.push(`${site}: endpoint is not a valid URL`)
      }
    }
    if (!siteApiKey(site, environment)) {
      issues.push(
        `${site}: ${siteApiKeyEnvironmentName(site)} or EXTERNAL_LAUNCH_API_KEY is not configured`,
      )
    }
  }
  return issues
}
