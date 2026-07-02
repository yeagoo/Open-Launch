export const SKILL_PUBLICATION_SITES = [
  { site: "mf8", name: "MiFanBa", domain: "mf8.biz", dr: null },
  { site: "bigkr", name: "BigKr", domain: "bigkr.com", dr: null },
  { site: "hicyou", name: "HiCyou", domain: "hicyou.com", dr: null },
  { site: "mifar", name: "MiFar", domain: "mifar.net", dr: null },
  { site: "qoo", name: "Qoo.IM", domain: "qoo.im", dr: null },
  { site: "fastd", name: "FastD", domain: "fastd.top", dr: null },
  { site: "xlayers", name: "Xlayers", domain: "xlayers.dev", dr: null },
  { site: "upperstory", name: "Upperstory", domain: "upperstory.io", dr: null },
  { site: "xemvip", name: "XemVIP", domain: "xemvip.com", dr: null },
  { site: "skachat", name: "SkaChat", domain: "skachat.xyz", dr: null },
  { site: "nexablocks", name: "NexaBlocks", domain: "nexablocks.com", dr: null },
  {
    site: "blackhawkegames",
    name: "BlackHawkGame",
    domain: "blackhawkegames.com",
    dr: null,
  },
] as const satisfies readonly SkillPublicationSite[]

export const SKILL_PUBLICATION_SITE_COUNT = SKILL_PUBLICATION_SITES.length
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

export function skillPublicationSites(): SkillPublicationSite[] {
  return SKILL_PUBLICATION_SITES.map((site) => ({ ...site }))
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
