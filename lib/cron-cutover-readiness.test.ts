import { describe, expect, it } from "vitest"

import {
  evaluateCronCutoverReadiness,
  type CronCutoverSnapshot,
  type CronScheduleSnapshot,
} from "@/lib/cron-cutover-readiness"
import { scheduledFireTimesBetween } from "@/lib/cron-match"
import type { CronMaterializationEvidence } from "@/lib/cron-materialization-audit"
import { cronTaskPolicies, type CronTaskPolicy } from "@/lib/cron-policy"

const checkedAt = new Date("2026-07-30T12:00:30.000Z")
const strictPolicy = cronTaskPolicies.find(
  (policy) =>
    policy.idempotency === "strict" &&
    cronTaskPolicies.filter((candidate) => candidate.concurrencyGroup === policy.concurrencyGroup)
      .length === 1,
)!
const approvedPolicies = cronTaskPolicies.map((policy) => ({
  ...policy,
  decision: "approved" as const,
}))
const comparisonStart = new Date(checkedAt.getTime() - 48 * 60 * 60 * 1_000)
const completeCanaryWindows = scheduledFireTimesBetween(
  strictPolicy.expectedCronExpression,
  comparisonStart,
  checkedAt,
).filter((value) => value.getTime() >= comparisonStart.getTime())

function scheduleSnapshot(policy: CronTaskPolicy): CronScheduleSnapshot {
  return {
    id: cronTaskPolicies.findIndex((candidate) => candidate.path === policy.path) + 1,
    path: policy.path,
    enabled: true,
    cronExpression: policy.expectedCronExpression,
    updatedAt: new Date("2026-07-01T00:00:00.000Z"),
    misfirePolicy: policy.misfirePolicy,
    maxCatchUpMinutes: policy.maxCatchUpMinutes,
    retryPolicy: policy.retryPolicy,
    maxAttempts: policy.maxAttempts,
    concurrencyGroup: policy.concurrencyGroup,
    idempotencyClass: policy.idempotency,
    requiresScheduledFor: policy.requiresScheduledFor,
  }
}

function materializationEvidence(
  overrides: Partial<CronMaterializationEvidence> = {},
): CronMaterializationEvidence {
  return {
    auditRuns: 2881,
    continuityGapMinutes: 0,
    overlappingAuditRuns: 0,
    clampedRuns: 0,
    overCatchUpRuns: 0,
    countMismatchRuns: 0,
    candidateCountMismatchRuns: 0,
    scopePolicyDriftRuns: 0,
    canaryPolicyDriftRuns: 0,
    expectedJobs: 100,
    actualJobs: 100,
    missingJobs: 0,
    extraJobs: 0,
    candidate: {
      taskPath: strictPolicy.path,
      expectedWindows: 100,
      actualWindows: 100,
      missingJobs: 0,
      extraJobs: 0,
      sameMinuteSuccess: 100,
      boundedDeferredSuccess: 0,
      failedAttempt: 0,
      unexplainedMissing: 0,
      unexpectedExtra: 0,
      succeededLedgerJobs: 100,
      unsuccessfulLedgerJobs: 0,
    },
    nonCandidateMissingByTask: [],
    ...overrides,
  }
}

function snapshot(overrides: Partial<CronCutoverSnapshot> = {}): CronCutoverSnapshot {
  return {
    checkedAt,
    schedules: approvedPolicies.map(scheduleSnapshot),
    cursor: {
      scannedThrough: new Date("2026-07-30T12:00:00.000Z"),
      createdAt: new Date("2026-07-28T11:59:00.000Z"),
    },
    activeLedgerJobs: [],
    materializationEvidence: materializationEvidence(),
    canaryOperational: {
      taskPath: strictPolicy.path,
      unresolvedTerminalItems: 0,
      staleClaims: 0,
      missingDurableItems: 0,
      configurationIssues: [],
    },
    shadow: {
      shadowWindows: 100,
      matchedWindows: 100,
      missingLegacyWindows: 0,
      extraLegacyWindows: 0,
    },
    canary: null,
    ...overrides,
  }
}

describe("Cron cutover readiness", () => {
  it("allows a fully matched 48-hour shadow to enter one strict approved canary", () => {
    const result = evaluateCronCutoverReadiness({
      target: "canary",
      canaryTaskPath: strictPolicy.path,
      policies: approvedPolicies,
      snapshot: snapshot(),
    })
    expect(result.ready).toBe(true)
    expect(result.blockers).toEqual([])
    expect(result.nextFullMinute).toBe("2026-07-30T12:01:00.000Z")
  })

  it("requires task-specific operational evidence", () => {
    const result = evaluateCronCutoverReadiness({
      target: "canary",
      canaryTaskPath: strictPolicy.path,
      policies: approvedPolicies,
      snapshot: snapshot({ canaryOperational: null }),
    })
    expect(result.ready).toBe(false)
    expect(result.blockers).toContain(
      `canary operational readiness is missing for ${strictPolicy.path}`,
    )
  })

  it("keeps non-candidate drift diagnostic while allowing the approved bounded recovery", () => {
    const result = evaluateCronCutoverReadiness({
      target: "canary",
      canaryTaskPath: strictPolicy.path,
      policies: approvedPolicies,
      snapshot: snapshot({
        materializationEvidence: materializationEvidence({
          countMismatchRuns: 2,
          scopePolicyDriftRuns: 2,
          missingJobs: 2,
          candidate: {
            ...materializationEvidence().candidate!,
            sameMinuteSuccess: 99,
            boundedDeferredSuccess: 1,
          },
          nonCandidateMissingByTask: [{ taskPath: "/api/cron/skill-publish", count: 2 }],
        }),
      }),
    })

    expect(result.ready).toBe(true)
    expect(result.blockers).toEqual([])
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("non-candidate planner count"),
        expect.stringContaining("non-candidate scope policy"),
        expect.stringContaining("non-candidate materialization"),
        expect.stringContaining("recovered 1 legacy"),
        expect.stringContaining("skill-publish"),
      ]),
    )
  })

  it("blocks a scan range beyond the candidate catch-up bound", () => {
    const result = evaluateCronCutoverReadiness({
      target: "canary",
      canaryTaskPath: strictPolicy.path,
      policies: approvedPolicies,
      snapshot: snapshot({
        materializationEvidence: materializationEvidence({ overCatchUpRuns: 1 }),
      }),
    })
    expect(result.ready).toBe(false)
    expect(result.blockers).toContain(
      "materialization audit has 1 scan run(s) beyond the candidate catch-up bound",
    )
  })

  it("fails closed on proposed policy, drift, stale shadow, and active jobs", () => {
    const schedules = approvedPolicies.map(scheduleSnapshot)
    schedules[0] = { ...schedules[0], retryPolicy: "none" }
    const policiesWithProposedCanary = cronTaskPolicies.map((policy) =>
      policy.path === strictPolicy.path ? { ...policy, decision: "proposed" as const } : policy,
    )
    const result = evaluateCronCutoverReadiness({
      target: "canary",
      canaryTaskPath: strictPolicy.path,
      policies: policiesWithProposedCanary,
      snapshot: snapshot({
        schedules,
        cursor: {
          scannedThrough: new Date("2026-07-30T11:50:00.000Z"),
          createdAt: new Date("2026-07-30T11:00:00.000Z"),
        },
        activeLedgerJobs: [{ taskPath: strictPolicy.path, status: "pending", count: 1 }],
        canaryOperational: {
          taskPath: strictPolicy.path,
          unresolvedTerminalItems: 1,
          staleClaims: 1,
          missingDurableItems: 1,
          configurationIssues: ["mf8: endpoint is not configured"],
        },
        shadow: {
          shadowWindows: 10,
          matchedWindows: 8,
          missingLegacyWindows: 1,
          extraLegacyWindows: 1,
        },
        materializationEvidence: materializationEvidence({
          continuityGapMinutes: 60,
          missingJobs: 1,
          extraJobs: 1,
          candidate: {
            ...materializationEvidence().candidate!,
            missingJobs: 1,
            extraJobs: 1,
            failedAttempt: 1,
            unexplainedMissing: 1,
            unexpectedExtra: 1,
          },
        }),
      }),
    })
    expect(result.ready).toBe(false)
    expect(result.blockers).toEqual(
      expect.arrayContaining([
        expect.stringContaining("database policy drift"),
        expect.stringContaining("explicitly approved"),
        expect.stringContaining("cursor is stale"),
        expect.stringContaining("uncovered minute"),
        expect.stringContaining("candidate jobs differ"),
        expect.stringContaining("unexplainedMissing=1"),
        expect.stringContaining("unexpected extra"),
        expect.stringContaining("active/attention"),
        expect.stringContaining("unresolved terminal business"),
        expect.stringContaining("stale business claim"),
        expect.stringContaining("missing durable queue state"),
        expect.stringContaining("mf8: endpoint is not configured"),
      ]),
    )
  })

  it("requires clean 48-hour canary evidence before full ledger authority", () => {
    const ready = evaluateCronCutoverReadiness({
      target: "ledger",
      canaryTaskPath: strictPolicy.path,
      policies: approvedPolicies,
      snapshot: snapshot({
        canary: {
          taskPath: strictPolicy.path,
          firstCreatedAt: new Date("2026-07-28T11:00:00.000Z"),
          scheduledFor: completeCanaryWindows,
          succeeded: completeCanaryWindows.length,
          failed: 0,
          uncertain: 0,
          deadLettered: 0,
        },
      }),
    })
    expect(ready.ready).toBe(true)

    const blocked = evaluateCronCutoverReadiness({
      target: "ledger",
      canaryTaskPath: strictPolicy.path,
      policies: approvedPolicies,
      snapshot: snapshot({
        activeLedgerJobs: [{ taskPath: strictPolicy.path, status: "uncertain", count: 1 }],
        materializationEvidence: materializationEvidence({
          continuityGapMinutes: 1,
          missingJobs: 1,
          candidate: {
            ...materializationEvidence().candidate!,
            missingJobs: 1,
            succeededLedgerJobs: 0,
            unsuccessfulLedgerJobs: 1,
          },
        }),
        canary: {
          taskPath: strictPolicy.path,
          firstCreatedAt: new Date("2026-07-30T11:00:00.000Z"),
          scheduledFor: completeCanaryWindows.slice(1),
          succeeded: 0,
          failed: 1,
          uncertain: 1,
          deadLettered: 0,
        },
      }),
    })
    expect(blocked.ready).toBe(false)
    expect(blocked.blockers).toEqual(
      expect.arrayContaining([
        expect.stringContaining("uncovered minute"),
        expect.stringContaining("jobs differ"),
        expect.stringContaining("unsuccessful job"),
        expect.stringContaining("no successful"),
        expect.stringContaining("failures=1"),
        expect.stringContaining("unresolved"),
      ]),
    )
  })
})
