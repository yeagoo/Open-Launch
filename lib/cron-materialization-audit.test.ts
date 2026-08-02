import { describe, expect, it } from "vitest"

import { planCronMaterialization, type LedgerSchedule } from "@/lib/cron-ledger-core"
import {
  cronSchedulePolicyFingerprint,
  evaluateCronMaterializationEvidence,
  type CronMaterializationAuditRecord,
} from "@/lib/cron-materialization-audit"

const candidatePath = "/api/cron/syndicate-launches"
const schedule: LedgerSchedule = {
  id: 1,
  path: candidatePath,
  cronExpression: "*/2 * * * *",
  enabled: true,
  updatedAt: new Date("2026-07-01T00:00:00.000Z"),
  misfirePolicy: "latest",
  maxCatchUpMinutes: 60,
  retryPolicy: "handler-managed",
  maxAttempts: 1,
  concurrencyGroup: "syndication",
  idempotencyClass: "strict",
  requiresScheduledFor: false,
}
const policyFingerprint = cronSchedulePolicyFingerprint([schedule])

function audit(from: string, through: string): CronMaterializationAuditRecord {
  const scannedFrom = new Date(from)
  const scannedThrough = new Date(through)
  const plan = planCronMaterialization({
    cursorScannedThrough: new Date(scannedFrom.getTime() - 60_000),
    now: scannedThrough,
    schedules: [schedule],
    globalCatchUpMinutes: (scannedThrough.getTime() - scannedFrom.getTime()) / 60_000 + 1,
  })
  return {
    executionMode: "shadow",
    scopeKind: "all",
    taskPath: null,
    scannedFrom,
    scannedThrough,
    cursorWasClamped: false,
    plannedCount: plan.jobs.length,
    insertedCount: plan.jobs.length,
    canaryPlannedCount: plan.jobs.length,
    canaryInsertedCount: plan.jobs.length,
    policyFingerprint,
    canaryPolicyFingerprint: policyFingerprint,
    createdAt: scannedThrough,
  }
}

describe("cron materialization audit evidence", () => {
  it("accepts a latest-policy window recovered by a later legacy success", () => {
    const evidence = evaluateCronMaterializationEvidence({
      checkedAt: new Date("2026-08-02T00:04:30.000Z"),
      observationMinutes: 4,
      reconciliationLagMinutes: 0,
      executionMode: "shadow",
      scopeKind: "all",
      scopeTaskPath: null,
      canaryTaskPath: candidatePath,
      schedules: [schedule],
      audits: [
        audit("2026-08-02T00:00:00.000Z", "2026-08-02T00:00:00.000Z"),
        audit("2026-08-02T00:01:00.000Z", "2026-08-02T00:03:00.000Z"),
        audit("2026-08-02T00:04:00.000Z", "2026-08-02T00:04:00.000Z"),
      ],
      jobs: ["00:00", "00:02", "00:04"].map((minute) => ({
        taskPath: candidatePath,
        scheduledFor: new Date(`2026-08-02T${minute}:00.000Z`),
        executionMode: "shadow" as const,
        status: "cancelled",
        statusCode: null,
      })),
      legacyAttempts: ["00:00", "00:04"].map((minute) => ({
        taskPath: candidatePath,
        dispatchedAt: new Date(`2026-08-02T${minute}:10.000Z`),
        statusCode: 200,
      })),
    })

    expect(evidence).toMatchObject({
      continuityGapMinutes: 0,
      countMismatchRuns: 0,
      candidateCountMismatchRuns: 0,
      missingJobs: 0,
      extraJobs: 0,
      candidate: {
        expectedWindows: 3,
        missingJobs: 0,
        extraJobs: 0,
        sameMinuteSuccess: 2,
        boundedDeferredSuccess: 1,
        failedAttempt: 0,
        unexplainedMissing: 0,
        unexpectedExtra: 0,
      },
    })
  })

  it("fails closed on a scan gap, fingerprint drift, and planner/job mismatch", () => {
    const driftedAudit = {
      ...audit("2026-08-02T00:03:00.000Z", "2026-08-02T00:04:00.000Z"),
      policyFingerprint: "a".repeat(64),
      canaryPolicyFingerprint: "b".repeat(64),
      plannedCount: 99,
      canaryPlannedCount: 99,
    }
    const evidence = evaluateCronMaterializationEvidence({
      checkedAt: new Date("2026-08-02T00:04:30.000Z"),
      observationMinutes: 4,
      reconciliationLagMinutes: 0,
      executionMode: "shadow",
      scopeKind: "all",
      scopeTaskPath: null,
      canaryTaskPath: candidatePath,
      schedules: [schedule],
      audits: [audit("2026-08-02T00:00:00.000Z", "2026-08-02T00:01:00.000Z"), driftedAudit],
      jobs: [],
      legacyAttempts: [],
    })

    expect(evidence.continuityGapMinutes).toBe(1)
    expect(evidence.scopePolicyDriftRuns).toBe(1)
    expect(evidence.canaryPolicyDriftRuns).toBe(1)
    expect(evidence.countMismatchRuns).toBe(1)
    expect(evidence.candidateCountMismatchRuns).toBe(1)
    expect(evidence.missingJobs).toBeGreaterThan(0)
  })
})
