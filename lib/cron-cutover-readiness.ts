import { resolveCronRuntimeAuthority } from "@/lib/cron-cutover"
import { isSafeCronTaskPath, type CronSchedulerMode } from "@/lib/cron-ledger-core"
import type { CronMaterializationEvidence } from "@/lib/cron-materialization-audit"
import {
  APPROVED_CRON_CANARY_TASK_PATH,
  cronTaskPolicies,
  validateCronTaskPolicies,
  type CronTaskPolicy,
} from "@/lib/cron-policy"

export type CronCutoverTarget = Exclude<CronSchedulerMode, "legacy">

export interface CronScheduleSnapshot {
  id: number
  path: string
  enabled: boolean
  cronExpression: string
  updatedAt: Date
  misfirePolicy: string | null
  maxCatchUpMinutes: number | null
  retryPolicy: string | null
  maxAttempts: number | null
  concurrencyGroup: string | null
  idempotencyClass: string | null
  requiresScheduledFor: boolean | null
}

export interface CronCutoverSnapshot {
  checkedAt: Date
  schedules: CronScheduleSnapshot[]
  cursor: { scannedThrough: Date; createdAt: Date } | null
  activeLedgerJobs: Array<{ taskPath: string; status: string; count: number }>
  materializationEvidence: CronMaterializationEvidence | null
  canaryOperational: {
    taskPath: string
    unresolvedTerminalItems: number
    staleClaims: number
    missingDurableItems: number
    configurationIssues: string[]
  } | null
  shadow: {
    shadowWindows: number
    matchedWindows: number
    missingLegacyWindows: number
    extraLegacyWindows: number
  }
  canary: {
    taskPath: string
    firstCreatedAt: Date | null
    scheduledFor: Date[]
    succeeded: number
    failed: number
    uncertain: number
    deadLettered: number
  } | null
}

export interface CronCutoverReadiness {
  target: CronCutoverTarget
  canaryTaskPath: string | null
  ready: boolean
  blockers: string[]
  warnings: string[]
  nextFullMinute: string
}

export function evaluateCronCutoverReadiness(input: {
  target: CronCutoverTarget
  canaryTaskPath?: string
  snapshot: CronCutoverSnapshot
  policies?: readonly CronTaskPolicy[]
}): CronCutoverReadiness {
  const policies = input.policies ?? cronTaskPolicies
  const blockers = validateCronTaskPolicies(policies)
  const warnings: string[] = []
  const schedulesByPath = new Map(
    input.snapshot.schedules.map((schedule) => [schedule.path, schedule]),
  )

  for (const policy of policies) {
    const schedule = schedulesByPath.get(policy.path)
    if (!schedule) {
      blockers.push(`database schedule is missing: ${policy.path}`)
      continue
    }
    const mismatches = policyMismatches(schedule, policy)
    if (mismatches.length > 0) {
      blockers.push(`${policy.path}: database policy drift (${mismatches.join(", ")})`)
    }
  }
  for (const schedule of input.snapshot.schedules) {
    if (!policies.some((policy) => policy.path === schedule.path)) {
      blockers.push(`database schedule is absent from code policy inventory: ${schedule.path}`)
    }
  }

  const canaryTaskPath = input.canaryTaskPath?.trim() || null
  const activeJobs = input.snapshot.activeLedgerJobs.reduce((sum, row) => sum + row.count, 0)
  if (input.target === "canary") {
    try {
      resolveCronRuntimeAuthority(
        {
          CRON_SCHEDULER_MODE: "canary",
          CRON_LEDGER_CANARY_TASK_PATH: canaryTaskPath ?? undefined,
        },
        policies,
      )
    } catch (error) {
      blockers.push(error instanceof Error ? error.message : String(error))
    }
    if (canaryTaskPath) {
      const schedule = schedulesByPath.get(canaryTaskPath)
      if (schedule && !schedule.enabled)
        blockers.push(`canary schedule is disabled: ${canaryTaskPath}`)
    }

    if (!input.snapshot.cursor) {
      blockers.push("materialization cursor is missing; shadow has not run")
    } else {
      appendCursorFreshnessBlocker(blockers, input.snapshot)
    }
    appendMaterializationEvidence(blockers, warnings, input.snapshot.materializationEvidence, {
      target: "canary",
      canaryTaskPath,
      policies,
    })
    if (activeJobs > 0) {
      blockers.push(`ledger has ${activeJobs} active/attention job(s) before canary cutover`)
    }
    appendCanaryOperationalBlockers(blockers, canaryTaskPath, input.snapshot.canaryOperational)
  } else if (input.target === "ledger") {
    try {
      resolveCronRuntimeAuthority({ CRON_SCHEDULER_MODE: "ledger" }, policies)
    } catch (error) {
      blockers.push(error instanceof Error ? error.message : String(error))
    }
    if (!input.snapshot.cursor) {
      blockers.push("materialization cursor is missing; canary materialization has not run")
    } else {
      appendCursorFreshnessBlocker(blockers, input.snapshot)
    }
    appendMaterializationEvidence(blockers, warnings, input.snapshot.materializationEvidence, {
      target: "ledger",
      canaryTaskPath,
      policies,
    })
    if (!canaryTaskPath || !isSafeCronTaskPath(canaryTaskPath)) {
      blockers.push("full ledger preflight requires the reviewed canary task path")
    } else if (!input.snapshot.canary || input.snapshot.canary.taskPath !== canaryTaskPath) {
      blockers.push("canary observation is missing for the reviewed task")
    } else {
      const canary = input.snapshot.canary
      const actualWindows = new Set(
        canary.scheduledFor.map((scheduledFor) => scheduledFor.toISOString()),
      )
      if (actualWindows.size !== canary.scheduledFor.length) {
        blockers.push("canary observation contains duplicate scheduled windows")
      }
      if (canary.succeeded === 0) blockers.push("canary has no successful ledger execution")
      if (canary.failed > 0 || canary.uncertain > 0 || canary.deadLettered > 0) {
        blockers.push(
          `canary has failures=${canary.failed}, uncertain=${canary.uncertain}, deadLettered=${canary.deadLettered}`,
        )
      }
    }
    const attentionJobs = input.snapshot.activeLedgerJobs
      .filter((row) => row.status === "uncertain" || row.status === "dead_lettered")
      .reduce((sum, row) => sum + row.count, 0)
    if (attentionJobs > 0) {
      blockers.push(`ledger has ${attentionJobs} unresolved uncertain/dead-letter job(s)`)
    }
    if (activeJobs > 0) {
      blockers.push(`ledger has ${activeJobs} active/attention job(s) before full cutover`)
    }
  } else {
    if (activeJobs > 0) {
      blockers.push(`ledger has ${activeJobs} active/attention job(s) before shadow authority`)
    }
    if (canaryTaskPath) {
      warnings.push("canary task is ignored for a shadow preflight")
    }
  }

  return {
    target: input.target,
    canaryTaskPath,
    ready: blockers.length === 0,
    blockers: [...new Set(blockers)],
    warnings,
    nextFullMinute: nextFullUtcMinute(input.snapshot.checkedAt).toISOString(),
  }
}

function appendMaterializationEvidence(
  blockers: string[],
  warnings: string[],
  evidence: CronMaterializationEvidence | null,
  input: {
    target: "canary" | "ledger"
    canaryTaskPath: string | null
    policies: readonly CronTaskPolicy[]
  },
): void {
  if (!evidence) {
    blockers.push("48-hour materialization audit evidence is missing")
    return
  }
  if (evidence.auditRuns === 0) blockers.push("materialization audit contains no scan runs")
  if (evidence.continuityGapMinutes > 0) {
    blockers.push(
      `materialization audit has ${evidence.continuityGapMinutes} uncovered minute(s) in 48 hours`,
    )
  }
  if (evidence.overlappingAuditRuns > 0) {
    blockers.push(`materialization audit has ${evidence.overlappingAuditRuns} overlapping run(s)`)
  }
  if (evidence.clampedRuns > 0) {
    blockers.push(`materialization audit has ${evidence.clampedRuns} clamped scan run(s)`)
  }
  if (evidence.overCatchUpRuns > 0) {
    blockers.push(
      `materialization audit has ${evidence.overCatchUpRuns} scan run(s) beyond the candidate catch-up bound`,
    )
  }
  if (evidence.candidateCountMismatchRuns > 0) {
    blockers.push(
      `candidate planner count differs in ${evidence.candidateCountMismatchRuns} audit run(s)`,
    )
  }
  if (input.target === "ledger" && evidence.countMismatchRuns > 0) {
    blockers.push(
      `materialization audit has ${evidence.countMismatchRuns} planner count mismatch(es)`,
    )
  } else if (evidence.countMismatchRuns > 0) {
    warnings.push(
      `non-candidate planner count differs in ${evidence.countMismatchRuns} audit run(s)`,
    )
  }
  if (evidence.canaryPolicyDriftRuns > 0) {
    blockers.push(
      `canary policy fingerprint changed in ${evidence.canaryPolicyDriftRuns} audit run(s)`,
    )
  }
  if (input.target === "ledger" && evidence.scopePolicyDriftRuns > 0) {
    blockers.push(`materialization scope policy changed in ${evidence.scopePolicyDriftRuns} run(s)`)
  } else if (evidence.scopePolicyDriftRuns > 0) {
    warnings.push(
      `non-candidate scope policy changed in ${evidence.scopePolicyDriftRuns} audit run(s)`,
    )
  }
  if (input.target === "ledger" && (evidence.missingJobs > 0 || evidence.extraJobs > 0)) {
    blockers.push(
      `materialization jobs differ from planner: missing=${evidence.missingJobs}, extra=${evidence.extraJobs}`,
    )
  } else if (evidence.missingJobs > 0 || evidence.extraJobs > 0) {
    warnings.push(
      `non-candidate materialization diagnostics: missing=${evidence.missingJobs}, extra=${evidence.extraJobs}`,
    )
  }

  const candidate = evidence.candidate
  if (!candidate || candidate.taskPath !== input.canaryTaskPath) {
    blockers.push("candidate materialization evidence is missing for the reviewed task")
    return
  }
  if (candidate.expectedWindows === 0) {
    blockers.push("candidate materialization evidence contains no expected window")
  }
  if (candidate.missingJobs > 0 || candidate.extraJobs > 0) {
    blockers.push(
      `candidate jobs differ from planner: missing=${candidate.missingJobs}, extra=${candidate.extraJobs}`,
    )
  }
  if (
    input.target === "canary" &&
    (candidate.failedAttempt > 0 || candidate.unexplainedMissing > 0)
  ) {
    blockers.push(
      `candidate legacy evidence has failed=${candidate.failedAttempt}, unexplainedMissing=${candidate.unexplainedMissing}`,
    )
  }
  if (input.target === "canary" && candidate.unexpectedExtra > 0) {
    blockers.push(
      `candidate legacy evidence has ${candidate.unexpectedExtra} unexpected extra window(s)`,
    )
  }
  if (candidate.boundedDeferredSuccess > 0) {
    const policy = input.policies.find((entry) => entry.path === input.canaryTaskPath)
    const deferredIsApproved =
      input.target === "canary" &&
      input.canaryTaskPath === APPROVED_CRON_CANARY_TASK_PATH &&
      policy?.misfirePolicy === "latest" &&
      policy.idempotency === "strict"
    if (!deferredIsApproved) {
      blockers.push(
        `candidate has ${candidate.boundedDeferredSuccess} deferred success(es) without the approved exception`,
      )
    } else {
      warnings.push(
        `candidate recovered ${candidate.boundedDeferredSuccess} legacy window(s) within its catch-up bound`,
      )
    }
  }
  if (input.target === "ledger" && candidate.unsuccessfulLedgerJobs > 0) {
    blockers.push(
      `candidate ledger evidence has ${candidate.unsuccessfulLedgerJobs} unsuccessful job(s)`,
    )
  }
  if (input.target === "canary") {
    for (const diagnostic of evidence.nonCandidateMissingByTask) {
      warnings.push(
        `non-candidate legacy diagnostic: ${diagnostic.taskPath} missing ${diagnostic.count} same-minute success(es)`,
      )
    }
  }
}

function appendCanaryOperationalBlockers(
  blockers: string[],
  canaryTaskPath: string | null,
  operational: CronCutoverSnapshot["canaryOperational"],
): void {
  if (!canaryTaskPath) return
  if (!operational || operational.taskPath !== canaryTaskPath) {
    blockers.push(`canary operational readiness is missing for ${canaryTaskPath}`)
    return
  }
  if (operational.unresolvedTerminalItems > 0) {
    blockers.push(
      `canary task has ${operational.unresolvedTerminalItems} unresolved terminal business item(s)`,
    )
  }
  if (operational.staleClaims > 0) {
    blockers.push(`canary task has ${operational.staleClaims} stale business claim(s)`)
  }
  if (operational.missingDurableItems > 0) {
    blockers.push(
      `canary task has ${operational.missingDurableItems} business item(s) missing durable queue state`,
    )
  }
  for (const issue of operational.configurationIssues) {
    blockers.push(`canary task configuration: ${issue}`)
  }
}

function appendCursorFreshnessBlocker(blockers: string[], snapshot: CronCutoverSnapshot): void {
  if (!snapshot.cursor) return
  const cursorAgeMs = snapshot.checkedAt.getTime() - snapshot.cursor.scannedThrough.getTime()
  if (cursorAgeMs < 0 || cursorAgeMs > 120_000) {
    blockers.push(`materialization cursor is stale by ${Math.round(cursorAgeMs / 1_000)}s`)
  }
}

function policyMismatches(schedule: CronScheduleSnapshot, policy: CronTaskPolicy): string[] {
  const expected = {
    cronExpression: policy.expectedCronExpression,
    misfirePolicy: policy.misfirePolicy,
    maxCatchUpMinutes: policy.maxCatchUpMinutes,
    retryPolicy: policy.retryPolicy,
    maxAttempts: policy.maxAttempts,
    concurrencyGroup: policy.concurrencyGroup,
    idempotencyClass: policy.idempotency,
    requiresScheduledFor: policy.requiresScheduledFor,
  }
  return (Object.keys(expected) as Array<keyof typeof expected>).filter(
    (key) => schedule[key] !== expected[key],
  )
}

function nextFullUtcMinute(value: Date): Date {
  const minute = new Date(value)
  minute.setUTCSeconds(0, 0)
  return new Date(minute.getTime() + 60_000)
}
