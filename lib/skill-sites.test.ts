import { describe, expect, it } from "vitest"

import type { FriendSite } from "./directories-links"
import { buildSkillPublicationSchedule, skillPublicationSites } from "./skill-sites"

function site(id: string, dr: number): FriendSite {
  return {
    id,
    name: id,
    domain: `${id}.example.com`,
    url: `https://${id}.example.com`,
    category: "test",
    status: "active",
    dr,
    dr_last_checked_at: null,
    logo_svg: null,
    description: null,
    description_i18n: {},
  }
}

describe("skillPublicationSites", () => {
  it("selects 14 active unique domains in ascending DR order", () => {
    const sites = [
      { ...site("archived", 0), status: "archived" as const },
      site("site-03", 3),
      site("site-01", 1),
      site("site-02", 2),
      ...Array.from({ length: 12 }, (_, index) =>
        site(`site-${String(index + 4).padStart(2, "0")}`, index + 4),
      ),
    ]

    const selected = skillPublicationSites(sites)

    expect(selected).toHaveLength(14)
    expect(selected.map((row) => row.site)).toEqual([
      "site-01",
      "site-02",
      "site-03",
      "site-04",
      "site-05",
      "site-06",
      "site-07",
      "site-08",
      "site-09",
      "site-10",
      "site-11",
      "site-12",
      "site-13",
      "site-14",
    ])
  })
})

describe("buildSkillPublicationSchedule", () => {
  it("schedules 2 canaries on day 1, then 3 sites per day", () => {
    const sites = Array.from({ length: 14 }, (_, index) => ({
      site: `site-${index + 1}`,
      name: `Site ${index + 1}`,
      domain: `site-${index + 1}.example.com`,
      dr: index,
    }))

    const schedule = buildSkillPublicationSchedule(new Date("2026-07-01T16:30:00Z"), sites)

    expect(schedule.map((row) => row.batchDay)).toEqual([1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5])
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
      "2026-07-05",
      "2026-07-05",
    ])
  })
})
