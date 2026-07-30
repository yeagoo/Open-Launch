import { describe, expect, it } from "vitest"

import {
  CronLedgerConfigurationError,
  expiredLeaseDisposition,
  failedAttemptDisposition,
  isSafeCronTaskPath,
  normalizeCronTaskPathAllowlist,
  parseBooleanEnv,
  parseCronScheduledFor,
  parseCronSchedulerMode,
  planCronMaterialization,
  previousUtcCalendarMonth,
  resolveInternalCronBaseUrl,
  retryAvailableAt,
  sanitizeCronJobError,
  type LedgerSchedule,
} from "./cron-ledger-core"

const minute = (iso: string) => new Date(iso)

function schedule(overrides: Partial<LedgerSchedule> = {}): LedgerSchedule {
  return {
    id: 1,
    path: "/api/cron/example",
    cronExpression: "* * * * *",
    enabled: true,
    updatedAt: minute("2026-07-01T00:00:00.000Z"),
    misfirePolicy: "latest",
    maxCatchUpMinutes: 60,
    retryPolicy: "transient-bounded",
    maxAttempts: 2,
    concurrencyGroup: "test",
    idempotencyClass: "strict",
    requiresScheduledFor: false,
    ...overrides,
  }
}

describe("cron scheduler mode", () => {
  it("defaults to legacy and rejects unknown values", () => {
    expect(parseCronSchedulerMode(undefined)).toBe("legacy")
    expect(parseCronSchedulerMode(" shadow ")).toBe("shadow")
    expect(parseCronSchedulerMode("canary")).toBe("canary")
    expect(() => parseCronSchedulerMode("active")).toThrow(CronLedgerConfigurationError)
  })

  it("parses explicit boolean environment values and rejects ambiguity", () => {
    expect(parseBooleanEnv(undefined, true, "FEATURE")).toBe(true)
    expect(parseBooleanEnv(" false ", true, "FEATURE")).toBe(false)
    expect(parseBooleanEnv("1", false, "FEATURE")).toBe(true)
    expect(() => parseBooleanEnv("yes", false, "FEATURE")).toThrow(/FEATURE/)
  })

  it("accepts only canonical, bounded scheduled-for minutes", () => {
    const now = minute("2026-07-29T00:10:00.000Z")
    expect(parseCronScheduledFor("2026-07-29T00:05:00.000Z", now, 10)?.toISOString()).toBe(
      "2026-07-29T00:05:00.000Z",
    )
    expect(parseCronScheduledFor(null, now, 10)).toBeNull()
    expect(() => parseCronScheduledFor("2026-07-29T00:05:01.000Z", now, 10)).toThrow(
      CronLedgerConfigurationError,
    )
    expect(() => parseCronScheduledFor("2026-07-28T23:00:00.000Z", now, 10)).toThrow(
      CronLedgerConfigurationError,
    )
  })

  it("derives a recap month from the scheduled execution window", () => {
    expect(previousUtcCalendarMonth(minute("2026-07-01T00:00:00.000Z"))).toMatchObject({
      windowStart: minute("2026-06-01T00:00:00.000Z"),
      windowEnd: minute("2026-07-01T00:00:00.000Z"),
      monthLabel: "June 2026",
      slugSuffix: "2026-06",
    })
  })
})

describe("cron task path allowlist", () => {
  it("accepts only direct cron task routes", () => {
    expect(isSafeCronTaskPath("/api/cron/update-launches")).toBe(true)
    expect(isSafeCronTaskPath("/api/cron/dispatch")).toBe(false)
    expect(isSafeCronTaskPath("https://example.com/api/cron/task")).toBe(false)
    expect(isSafeCronTaskPath("/api/cron/../admin")).toBe(false)
    expect(isSafeCronTaskPath("/api/cron/task?token=x")).toBe(false)
  })

  it("normalizes a non-empty unique task allowlist and rejects ambiguity", () => {
    expect(normalizeCronTaskPathAllowlist([" /api/cron/update-launches "])).toEqual([
      "/api/cron/update-launches",
    ])
    expect(() => normalizeCronTaskPathAllowlist([])).toThrow(CronLedgerConfigurationError)
    expect(() =>
      normalizeCronTaskPathAllowlist(["/api/cron/update-launches", "/api/cron/update-launches"]),
    ).toThrow(CronLedgerConfigurationError)
    expect(() => normalizeCronTaskPathAllowlist(["/api/cron/../admin"])).toThrow(
      CronLedgerConfigurationError,
    )
  })

  it("accepts only loopback or single-label Compose HTTP origins", () => {
    expect(resolveInternalCronBaseUrl(undefined, "8080")).toBe("http://127.0.0.1:8080")
    expect(resolveInternalCronBaseUrl("http://web:3000")).toBe("http://web:3000")
    expect(() => resolveInternalCronBaseUrl("https://www.aat.ee")).toThrow(
      CronLedgerConfigurationError,
    )
    expect(() => resolveInternalCronBaseUrl("http://user:secret@web:3000")).toThrow(
      CronLedgerConfigurationError,
    )
    expect(() => resolveInternalCronBaseUrl("http://127.0.0.1:3000/api")).toThrow(
      CronLedgerConfigurationError,
    )
  })
})

describe("cron materialization planning", () => {
  it("materializes only the latest missed window for latest policy", () => {
    const plan = planCronMaterialization({
      cursorScannedThrough: minute("2026-07-29T00:00:00.000Z"),
      now: minute("2026-07-29T00:05:30.000Z"),
      schedules: [schedule()],
    })

    expect(plan.jobs.map((job) => job.scheduledFor.toISOString())).toEqual([
      "2026-07-29T00:05:00.000Z",
    ])
    expect(plan.scannedThrough.toISOString()).toBe("2026-07-29T00:05:00.000Z")
  })

  it("does not replay a skipped task but runs it in the current due minute", () => {
    const missed = planCronMaterialization({
      cursorScannedThrough: minute("2026-07-28T23:59:00.000Z"),
      now: minute("2026-07-29T00:05:00.000Z"),
      schedules: [
        schedule({
          cronExpression: "0 0 * * *",
          misfirePolicy: "skip",
          maxCatchUpMinutes: 0,
        }),
      ],
    })
    expect(missed.jobs).toEqual([])

    const current = planCronMaterialization({
      cursorScannedThrough: minute("2026-07-28T23:59:00.000Z"),
      now: minute("2026-07-29T00:00:30.000Z"),
      schedules: [
        schedule({
          cronExpression: "0 0 * * *",
          misfirePolicy: "skip",
          maxCatchUpMinutes: 0,
        }),
      ],
    })
    expect(current.jobs).toHaveLength(1)
  })

  it("supports bounded-all without exceeding task or global catch-up bounds", () => {
    const plan = planCronMaterialization({
      cursorScannedThrough: minute("2026-07-28T20:00:00.000Z"),
      now: minute("2026-07-29T00:05:00.000Z"),
      globalCatchUpMinutes: 10,
      schedules: [
        schedule({
          misfirePolicy: "bounded-all",
          maxCatchUpMinutes: 3,
        }),
      ],
    })

    expect(plan.cursorWasClamped).toBe(true)
    expect(plan.jobs.map((job) => job.scheduledFor.toISOString())).toEqual([
      "2026-07-29T00:02:00.000Z",
      "2026-07-29T00:03:00.000Z",
      "2026-07-29T00:04:00.000Z",
      "2026-07-29T00:05:00.000Z",
    ])
  })

  it("does not apply a newly edited expression to earlier missed minutes", () => {
    const plan = planCronMaterialization({
      cursorScannedThrough: minute("2026-07-29T00:00:00.000Z"),
      now: minute("2026-07-29T00:05:00.000Z"),
      schedules: [
        schedule({
          updatedAt: minute("2026-07-29T00:03:20.000Z"),
          misfirePolicy: "bounded-all",
        }),
      ],
    })
    expect(plan.jobs.map((job) => job.scheduledFor.toISOString())).toEqual([
      "2026-07-29T00:04:00.000Z",
      "2026-07-29T00:05:00.000Z",
    ])
  })

  it("fails closed when an enabled schedule lacks policy", () => {
    expect(() =>
      planCronMaterialization({
        cursorScannedThrough: null,
        now: minute("2026-07-29T00:00:00.000Z"),
        schedules: [schedule({ maxAttempts: null })],
      }),
    ).toThrow(/max attempts/)
  })
})

describe("cron job recovery", () => {
  it("retries expired strict-idempotent jobs and marks all weaker classes uncertain", () => {
    expect(
      expiredLeaseDisposition({
        idempotencyClass: "strict",
        attemptCount: 1,
        maxAttempts: 2,
      }),
    ).toBe("retry_wait")
    expect(
      expiredLeaseDisposition({
        idempotencyClass: "guarded",
        attemptCount: 1,
        maxAttempts: 2,
      }),
    ).toBe("uncertain")
    expect(
      expiredLeaseDisposition({
        idempotencyClass: "convergent",
        attemptCount: 2,
        maxAttempts: 2,
      }),
    ).toBe("uncertain")
  })

  it("retries only transient failures covered by the retry policy", () => {
    expect(
      failedAttemptDisposition({
        retryPolicy: "transient-bounded",
        idempotencyClass: "strict",
        attemptCount: 1,
        maxAttempts: 2,
        statusCode: 503,
      }),
    ).toBe("retry_wait")
    expect(
      failedAttemptDisposition({
        retryPolicy: "transient-bounded",
        idempotencyClass: "strict",
        attemptCount: 1,
        maxAttempts: 2,
        statusCode: 400,
      }),
    ).toBe("dead_lettered")
    expect(
      failedAttemptDisposition({
        retryPolicy: "handler-managed",
        idempotencyClass: "strict",
        attemptCount: 1,
        maxAttempts: 3,
        statusCode: 503,
      }),
    ).toBe("dead_lettered")
    expect(
      failedAttemptDisposition({
        retryPolicy: "transient-bounded",
        idempotencyClass: "guarded",
        attemptCount: 1,
        maxAttempts: 2,
        statusCode: 0,
      }),
    ).toBe("uncertain")
  })

  it("bounds retry delay and redacts stored errors", () => {
    expect(retryAvailableAt(1, minute("2026-07-29T00:00:00.000Z")).toISOString()).toBe(
      "2026-07-29T00:00:30.000Z",
    )
    const error = sanitizeCronJobError(
      "Bearer secret https://example.com/path?token=secret&x=y postgres://user:pass@db/x",
    )
    expect(error).not.toContain("secret")
    expect(error).not.toContain("user:pass")
    expect(error.length).toBeLessThanOrEqual(2000)
  })
})
