import { describe, expect, it } from "vitest"

import {
  assertCronCanarySchedulePolicy,
  assertCronLedgerScheduleInventory,
  cronTaskAuthority,
  resolveCronRuntimeAuthority,
  schedulerModeUsesLedgerWorker,
} from "@/lib/cron-cutover"
import { CronLedgerConfigurationError } from "@/lib/cron-ledger-core"
import { cronTaskPolicies, type CronTaskPolicy } from "@/lib/cron-policy"

const approvedStrictPolicy = {
  ...cronTaskPolicies.find(
    (policy) =>
      policy.idempotency === "strict" &&
      cronTaskPolicies.filter((candidate) => candidate.concurrencyGroup === policy.concurrencyGroup)
        .length === 1,
  )!,
  decision: "approved",
} satisfies CronTaskPolicy

function scheduleForPolicy(policy: CronTaskPolicy) {
  return {
    path: policy.path,
    enabled: true,
    cronExpression: policy.expectedCronExpression,
    misfirePolicy: policy.misfirePolicy,
    maxCatchUpMinutes: policy.maxCatchUpMinutes,
    retryPolicy: policy.retryPolicy,
    maxAttempts: policy.maxAttempts,
    concurrencyGroup: policy.concurrencyGroup,
    idempotencyClass: policy.idempotency,
    requiresScheduledFor: policy.requiresScheduledFor,
  }
}

describe("Cron cutover authority", () => {
  it("keeps legacy and shadow free of a latent canary selector", () => {
    expect(resolveCronRuntimeAuthority({ CRON_SCHEDULER_MODE: "legacy" })).toEqual({
      mode: "legacy",
      canaryTaskPath: null,
      ledgerTaskPaths: undefined,
    })
    expect(() =>
      resolveCronRuntimeAuthority({
        CRON_SCHEDULER_MODE: "shadow",
        CRON_LEDGER_CANARY_TASK_PATH: approvedStrictPolicy.path,
      }),
    ).toThrow(CronLedgerConfigurationError)
    expect(() =>
      resolveCronRuntimeAuthority(
        {
          CRON_SCHEDULER_MODE: "ledger",
          CRON_LEDGER_CANARY_TASK_PATH: approvedStrictPolicy.path,
        },
        [approvedStrictPolicy],
      ),
    ).toThrow(CronLedgerConfigurationError)
  })

  it("requires a reviewed, approved, strictly idempotent single canary task", () => {
    expect(
      resolveCronRuntimeAuthority(
        {
          CRON_SCHEDULER_MODE: "canary",
          CRON_LEDGER_CANARY_TASK_PATH: approvedStrictPolicy.path,
        },
        [approvedStrictPolicy],
      ),
    ).toEqual({
      mode: "canary",
      canaryTaskPath: approvedStrictPolicy.path,
      ledgerTaskPaths: [approvedStrictPolicy.path],
    })
    expect(() =>
      resolveCronRuntimeAuthority(
        {
          CRON_SCHEDULER_MODE: "canary",
          CRON_LEDGER_CANARY_TASK_PATH: approvedStrictPolicy.path,
        },
        [{ ...approvedStrictPolicy, decision: "proposed" }],
      ),
    ).toThrow(/explicitly approved/)
    expect(() =>
      resolveCronRuntimeAuthority(
        {
          CRON_SCHEDULER_MODE: "canary",
          CRON_LEDGER_CANARY_TASK_PATH: approvedStrictPolicy.path,
        },
        [{ ...approvedStrictPolicy, idempotency: "guarded" }],
      ),
    ).toThrow(/strict/)

    const sharedGroupPolicy = {
      ...approvedStrictPolicy,
      concurrencyGroup: "shared-test-group",
    } satisfies CronTaskPolicy
    expect(() =>
      resolveCronRuntimeAuthority(
        {
          CRON_SCHEDULER_MODE: "canary",
          CRON_LEDGER_CANARY_TASK_PATH: sharedGroupPolicy.path,
        },
        [
          sharedGroupPolicy,
          {
            ...sharedGroupPolicy,
            path: "/api/cron/shared-group-peer",
          },
        ],
      ),
    ).toThrow(/exclusive/)
  })

  it("blocks full ledger authority until every policy is approved", () => {
    expect(() => resolveCronRuntimeAuthority({ CRON_SCHEDULER_MODE: "ledger" })).toThrow(
      /all task policies/,
    )
    const approved = cronTaskPolicies.map((policy) => ({
      ...policy,
      decision: "approved" as const,
    }))
    expect(resolveCronRuntimeAuthority({ CRON_SCHEDULER_MODE: "ledger" }, approved)).toEqual({
      mode: "ledger",
      canaryTaskPath: null,
      ledgerTaskPaths: approved.map((policy) => policy.path),
    })
  })

  it("partitions exactly one canary from legacy authority", () => {
    const authority = resolveCronRuntimeAuthority(
      {
        CRON_SCHEDULER_MODE: "canary",
        CRON_LEDGER_CANARY_TASK_PATH: approvedStrictPolicy.path,
      },
      [approvedStrictPolicy],
    )
    expect(cronTaskAuthority(approvedStrictPolicy.path, authority)).toBe("ledger")
    expect(cronTaskAuthority("/api/cron/another-task", authority)).toBe("legacy")
    expect(schedulerModeUsesLedgerWorker("canary")).toBe(true)
    expect(schedulerModeUsesLedgerWorker("shadow")).toBe(false)
  })

  it("rejects disabled or database-drifted canary schedule rows at materialization time", () => {
    const authority = resolveCronRuntimeAuthority(
      {
        CRON_SCHEDULER_MODE: "canary",
        CRON_LEDGER_CANARY_TASK_PATH: approvedStrictPolicy.path,
      },
      [approvedStrictPolicy],
    )
    if (authority.mode !== "canary") throw new Error("expected canary authority")
    const schedule = scheduleForPolicy(approvedStrictPolicy)

    expect(() =>
      assertCronCanarySchedulePolicy(authority, schedule, [approvedStrictPolicy]),
    ).not.toThrow()
    expect(() =>
      assertCronCanarySchedulePolicy(authority, { ...schedule, enabled: false }, [
        approvedStrictPolicy,
      ]),
    ).toThrow(/disabled/)
    expect(() =>
      assertCronCanarySchedulePolicy(
        authority,
        { ...schedule, idempotencyClass: "guarded", concurrencyGroup: "shared" },
        [approvedStrictPolicy],
      ),
    ).toThrow(/database policy drift.*concurrencyGroup.*idempotencyClass/)
  })

  it("blocks full ledger materialization on unapproved, extra, missing, or safety-drifted rows", () => {
    const approved = cronTaskPolicies.map((policy) => ({
      ...policy,
      decision: "approved" as const,
    }))
    const schedules = approved.map(scheduleForPolicy)
    expect(() => assertCronLedgerScheduleInventory(schedules, approved)).not.toThrow()
    expect(() => assertCronLedgerScheduleInventory(schedules, cronTaskPolicies)).toThrow(
      /every code policy/,
    )
    expect(() =>
      assertCronLedgerScheduleInventory(
        [...schedules, { ...schedules[0], path: "/api/cron/unreviewed" }],
        approved,
      ),
    ).toThrow(/absent from approved code inventory/)
    expect(() => assertCronLedgerScheduleInventory(schedules.slice(1), approved)).toThrow(/missing/)
    expect(() =>
      assertCronLedgerScheduleInventory(
        [
          {
            ...schedules[0],
            idempotencyClass: schedules[0].idempotencyClass === "strict" ? "guarded" : "strict",
          },
          ...schedules.slice(1),
        ],
        approved,
      ),
    ).toThrow(/safety policy drift.*idempotencyClass/)
  })
})
