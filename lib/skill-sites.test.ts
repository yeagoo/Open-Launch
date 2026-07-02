import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import {
  buildSkillPublicationSchedule,
  SKILL_PUBLICATION_SITE_COUNT,
  skillPublicationSites,
} from "./skill-sites"

describe("skillPublicationSites", () => {
  it("uses the explicit navigation receiver allowlist", () => {
    const selected = skillPublicationSites()

    expect(selected).toHaveLength(SKILL_PUBLICATION_SITE_COUNT)
    expect(selected.map((row) => row.site)).toEqual([
      "mf8",
      "bigkr",
      "hicyou",
      "mifar",
      "qoo",
      "fastd",
      "xlayers",
      "upperstory",
      "xemvip",
      "skachat",
      "nexablocks",
      "blackhawkegames",
    ])
    expect(selected.map((row) => row.domain)).toEqual([
      "mf8.biz",
      "bigkr.com",
      "hicyou.com",
      "mifar.net",
      "qoo.im",
      "fastd.top",
      "xlayers.dev",
      "upperstory.io",
      "xemvip.com",
      "skachat.xyz",
      "nexablocks.com",
      "blackhawkegames.com",
    ])
  })

  it("keeps the distributable Skill target list in sync", () => {
    const skillMarkdown = readFileSync(
      join(process.cwd(), "skills/free-directory-submission/SKILL.md"),
      "utf8",
    )
    const targetSection = skillMarkdown.match(/## Target Sites\n\n([\s\S]+?)\n\nEach variant/)

    expect(targetSection?.[1].match(/^\d+\. `([^`]+)`/gm)).not.toBeNull()
    const skillSites = Array.from(targetSection?.[1].matchAll(/^\d+\. `([^`]+)`/gm) ?? []).map(
      (match) => match[1],
    )

    expect(skillSites).toEqual(skillPublicationSites().map((site) => site.site))
  })
})

describe("buildSkillPublicationSchedule", () => {
  it("schedules 2 canaries on day 1, then 3 sites per day", () => {
    const sites = Array.from({ length: SKILL_PUBLICATION_SITE_COUNT }, (_, index) => ({
      site: `site-${index + 1}`,
      name: `Site ${index + 1}`,
      domain: `site-${index + 1}.example.com`,
      dr: index,
    }))

    const schedule = buildSkillPublicationSchedule(new Date("2026-07-01T16:30:00Z"), sites)

    expect(schedule.map((row) => row.batchDay)).toEqual([1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5])
    expect(schedule.map((row) => row.scheduledFor)).toEqual([
      "2026-07-01",
      "2026-07-01",
      "2026-07-02",
      "2026-07-02",
      "2026-07-02",
      "2026-07-03",
      "2026-07-03",
      "2026-07-03",
      "2026-07-04",
      "2026-07-04",
      "2026-07-04",
      "2026-07-05",
    ])
  })
})
