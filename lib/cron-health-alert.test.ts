import { describe, expect, it } from "vitest"

import { cronHealthAlertFingerprint, cronHealthAlertIncidentAnchor } from "./cron-health-alert"

describe("cron health alert fingerprint", () => {
  it("is stable across task ordering and duplicate paths", () => {
    const expected = cronHealthAlertFingerprint(false, [
      "/api/cron/db-backup",
      "/api/cron/generate-blog-roundup",
    ])

    expect(
      cronHealthAlertFingerprint(false, [
        "/api/cron/generate-blog-roundup",
        "/api/cron/db-backup",
        "/api/cron/db-backup",
      ]),
    ).toBe(expected)
  })

  it("changes when the active task set changes", () => {
    expect(cronHealthAlertFingerprint(false, ["/api/cron/db-backup"])).not.toBe(
      cronHealthAlertFingerprint(false, ["/api/cron/generate-blog-roundup"]),
    )
  })

  it("changes when dispatcher health changes", () => {
    expect(cronHealthAlertFingerprint(false, ["/api/cron/db-backup"])).not.toBe(
      cronHealthAlertFingerprint(true, ["/api/cron/db-backup"]),
    )
  })
})

describe("cron health alert incident anchor", () => {
  const backup = {
    path: "/api/cron/db-backup",
    lastSuccessEpochSeconds: "100",
    scheduleUpdatedEpochSeconds: "50",
  }
  const roundup = {
    path: "/api/cron/generate-blog-roundup",
    lastSuccessEpochSeconds: null,
    scheduleUpdatedEpochSeconds: "60",
  }

  it("is stable across task ordering", () => {
    expect(cronHealthAlertIncidentAnchor(false, "200", [backup, roundup])).toBe(
      cronHealthAlertIncidentAnchor(false, "999", [roundup, backup]),
    )
  })

  it("changes after a stale task has a newer successful run", () => {
    expect(cronHealthAlertIncidentAnchor(false, null, [backup])).not.toBe(
      cronHealthAlertIncidentAnchor(false, null, [{ ...backup, lastSuccessEpochSeconds: "101" }]),
    )
  })

  it("changes after a stale task schedule is updated", () => {
    expect(cronHealthAlertIncidentAnchor(false, null, [roundup])).not.toBe(
      cronHealthAlertIncidentAnchor(false, null, [
        { ...roundup, scheduleUpdatedEpochSeconds: "61" },
      ]),
    )
  })

  it("uses the dispatcher's last run only during dispatcher silence", () => {
    expect(cronHealthAlertIncidentAnchor(true, "200", [])).not.toBe(
      cronHealthAlertIncidentAnchor(true, "201", []),
    )
    expect(cronHealthAlertIncidentAnchor(false, "200", [backup])).toBe(
      cronHealthAlertIncidentAnchor(false, "201", [backup]),
    )
  })
})
