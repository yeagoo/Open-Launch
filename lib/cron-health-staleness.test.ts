import { describe, expect, it } from "vitest"

import {
  CRON_HEALTH_MIN_GRACE_MS,
  CRON_HEALTH_SCHEDULE_BOUNDARY_TOLERANCE_MS,
  evaluateCronTaskStaleness,
} from "./cron-health-staleness"

const SIMULATE_ENGAGEMENT_CRON = "0 0,4,10,12,14,16,18,20,22 * * *"

describe("cron task staleness", () => {
  it("does not alert at a shared schedule boundary before the current run is persisted", () => {
    const result = evaluateCronTaskStaleness({
      cronExpression: SIMULATE_ENGAGEMENT_CRON,
      now: new Date("2026-07-23T14:00:05.000Z"),
      // The previous successful dispatch appears 40 seconds older than the
      // exact two-hour schedule boundary because of normal trigger jitter.
      secondsSinceLastSuccess: 2 * 60 * 60 + 40,
      secondsSinceCreated: 30 * 24 * 60 * 60,
    })

    expect(result).toMatchObject({ isStale: false })
    expect(result?.quietForMs).toBeLessThan(result?.graceMs ?? Number.NEGATIVE_INFINITY)
  })

  it("defers a daily stale alert while the replacement run is still inside the boundary window", () => {
    const cronExpression = "0 0 * * *"
    const common = {
      cronExpression,
      secondsSinceLastSuccess: 2 * 24 * 60 * 60 + 30,
      secondsSinceCreated: 30 * 24 * 60 * 60,
    }

    // Yesterday's run failed and today's run started in the same dispatcher
    // batch as cron-health. The success from two days ago is 48h 30s old, but
    // today's task still gets the configured two-minute completion window.
    expect(
      evaluateCronTaskStaleness({
        ...common,
        now: new Date("2026-07-29T00:00:41.000Z"),
      }),
    ).toMatchObject({ isStale: false })

    // If the replacement run also produces no success, the next health check
    // must still alert rather than granting another full daily interval.
    expect(
      evaluateCronTaskStaleness({
        ...common,
        now: new Date("2026-07-29T00:30:00.000Z"),
        secondsSinceLastSuccess: 2 * 24 * 60 * 60 + 30 * 60,
      }),
    ).toMatchObject({ isStale: true })
  })

  it("switches to the current daily window only after the boundary tolerance elapses", () => {
    const common = {
      cronExpression: "0 0 * * *",
      secondsSinceCreated: 30 * 24 * 60 * 60,
    }

    expect(
      evaluateCronTaskStaleness({
        ...common,
        now: new Date("2026-07-29T00:01:59.000Z"),
        secondsSinceLastSuccess: 2 * 24 * 60 * 60 + 1 * 60 + 48,
      }),
    ).toMatchObject({ isStale: false })

    expect(
      evaluateCronTaskStaleness({
        ...common,
        now: new Date("2026-07-29T00:02:01.000Z"),
        secondsSinceLastSuccess: 2 * 24 * 60 * 60 + 1 * 60 + 50,
      }),
    ).toMatchObject({ isStale: true })
  })

  it("still alerts after two scheduled opportunities have no success", () => {
    const result = evaluateCronTaskStaleness({
      cronExpression: SIMULATE_ENGAGEMENT_CRON,
      now: new Date("2026-07-23T14:30:00.000Z"),
      secondsSinceLastSuccess: 4 * 60 * 60 + 30 * 60,
      secondsSinceCreated: 30 * 24 * 60 * 60,
    })

    expect(result).toMatchObject({ isStale: true })
  })

  it("preserves irregular overnight schedule gaps", () => {
    const result = evaluateCronTaskStaleness({
      cronExpression: SIMULATE_ENGAGEMENT_CRON,
      // Just outside the two-minute boundary window, so 10:00 is a completed
      // fire and 04:00 is the second-most-recent fire.
      now: new Date("2026-07-23T10:02:05.000Z"),
      secondsSinceLastSuccess: 6 * 60 * 60 + 40,
      secondsSinceCreated: 30 * 24 * 60 * 60,
    })

    expect(result).toMatchObject({ isStale: false })
    expect(result?.graceMs).toBe(6 * 60 * 60 * 1000 + 2 * 60 * 1000 + 5000)
  })

  it("adds boundary tolerance after the minimum high-frequency grace", () => {
    const base = {
      cronExpression: "*/5 * * * *",
      now: new Date("2026-07-23T14:00:05.000Z"),
      secondsSinceCreated: 30 * 24 * 60 * 60,
    }

    expect(
      evaluateCronTaskStaleness({
        ...base,
        secondsSinceLastSuccess:
          (CRON_HEALTH_MIN_GRACE_MS + CRON_HEALTH_SCHEDULE_BOUNDARY_TOLERANCE_MS) / 1000,
      }),
    ).toMatchObject({ isStale: false })
    expect(
      evaluateCronTaskStaleness({
        ...base,
        secondsSinceLastSuccess:
          (CRON_HEALTH_MIN_GRACE_MS + CRON_HEALTH_SCHEDULE_BOUNDARY_TOLERANCE_MS) / 1000 + 1,
      }),
    ).toMatchObject({ isStale: true })
  })

  it("does not flag a new task before its first completed opportunity", () => {
    const base = {
      cronExpression: "0 12 * * 1",
      now: new Date("2026-07-23T14:00:05.000Z"),
      secondsSinceLastSuccess: undefined,
    }

    expect(
      evaluateCronTaskStaleness({
        ...base,
        secondsSinceCreated: 24 * 60 * 60,
      }),
    ).toMatchObject({ isStale: false })
    expect(
      evaluateCronTaskStaleness({
        ...base,
        secondsSinceCreated: 15 * 24 * 60 * 60,
      }),
    ).toMatchObject({ isStale: true })
  })

  it("returns null for an invalid cron expression", () => {
    expect(
      evaluateCronTaskStaleness({
        cronExpression: "invalid",
        now: new Date("2026-07-23T14:00:05.000Z"),
        secondsSinceLastSuccess: 0,
        secondsSinceCreated: 0,
      }),
    ).toBeNull()
  })
})
