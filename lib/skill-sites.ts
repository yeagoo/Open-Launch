import { allFriendLinks, type FriendSite } from "@/lib/directories-links"

export const SKILL_PUBLICATION_SITE_COUNT = 14
export const SKILL_CANARY_SITE_COUNT = 2
export const SKILL_ROLLOUT_SITES_PER_DAY = 3

export interface SkillPublicationSite {
  site: string
  name: string
  domain: string
  dr: number | null
}

export interface SkillPublicationScheduleRow extends SkillPublicationSite {
  batchDay: number
  scheduledFor: string
}

export function skillPublicationSites(
  sites: readonly FriendSite[] = allFriendLinks,
): SkillPublicationSite[] {
  const seenDomains = new Set<string>()
  const active = sites
    .filter((site) => site.status === "active")
    .filter((site) => {
      const domain = site.domain.toLowerCase()
      if (seenDomains.has(domain)) return false
      seenDomains.add(domain)
      return true
    })
    .sort((a, b) => {
      const drDelta = (a.dr ?? Number.POSITIVE_INFINITY) - (b.dr ?? Number.POSITIVE_INFINITY)
      if (drDelta !== 0) return drDelta
      return a.id.localeCompare(b.id)
    })

  return active.slice(0, SKILL_PUBLICATION_SITE_COUNT).map((site) => ({
    site: site.id,
    name: site.name,
    domain: site.domain,
    dr: site.dr,
  }))
}

export function buildSkillPublicationSchedule(
  startDate: Date = new Date(),
  sites: readonly SkillPublicationSite[] = skillPublicationSites(),
): SkillPublicationScheduleRow[] {
  if (sites.length !== SKILL_PUBLICATION_SITE_COUNT) {
    throw new Error(
      `Expected ${SKILL_PUBLICATION_SITE_COUNT} skill publication sites, got ${sites.length}`,
    )
  }

  return sites.map((site, index) => {
    const batchDay =
      index < SKILL_CANARY_SITE_COUNT
        ? 1
        : 2 + Math.floor((index - SKILL_CANARY_SITE_COUNT) / SKILL_ROLLOUT_SITES_PER_DAY)

    return {
      ...site,
      batchDay,
      scheduledFor: utcDateOnly(addUtcDays(startDate, batchDay - 1)),
    }
  })
}

function addUtcDays(date: Date, days: number): Date {
  const out = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  out.setUTCDate(out.getUTCDate() + days)
  return out
}

function utcDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10)
}
