import { resolveCronRuntimeAuthority } from "@/lib/cron-cutover"
import { isSafeCronTaskPath, type CronSchedulerMode } from "@/lib/cron-ledger-core"
import { scheduledFireTimesBetween } from "@/lib/cron-match"
import { cronTaskPolicies, validateCronTaskPolicies, type CronTaskPolicy } from "@/lib/cron-policy"

export type CronCutoverTarget = Exclude<CronSchedulerMode, "legacy">

export interface CronScheduleSnapshot {
  path: string
  enabled: boolean
  cronExpression: string
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

const REQUIRED_OBSERVATION_MS = 48 * 60 * 60 * 1_000

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
      const observationMs =
        input.snapshot.checkedAt.getTime() - input.snapshot.cursor.createdAt.getTime()
      if (observationMs < REQUIRED_OBSERVATION_MS) {
        blockers.push("shadow observation is shorter than 48 hours")
      }
    }
    if (input.snapshot.shadow.shadowWindows === 0) {
      blockers.push("shadow comparison contains no theoretical task windows")
    }
    if (input.snapshot.shadow.missingLegacyWindows > 0) {
      blockers.push(
        `shadow comparison is missing ${input.snapshot.shadow.missingLegacyWindows} legacy windows`,
      )
    }
    if (input.snapshot.shadow.extraLegacyWindows > 0) {
      blockers.push(
        `shadow comparison has ${input.snapshot.shadow.extraLegacyWindows} unexplained legacy windows`,
      )
    }
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
    if (!canaryTaskPath || !isSafeCronTaskPath(canaryTaskPath)) {
      blockers.push("full ledger preflight requires the reviewed canary task path")
    } else if (!input.snapshot.canary || input.snapshot.canary.taskPath !== canaryTaskPath) {
      blockers.push("canary observation is missing for the reviewed task")
    } else {
      const canary = input.snapshot.canary
      const observationMs = canary.firstCreatedAt
        ? input.snapshot.checkedAt.getTime() - canary.firstCreatedAt.getTime()
        : 0
      if (observationMs < REQUIRED_OBSERVATION_MS) {
        blockers.push("canary observation is shorter than 48 hours")
      }
      const canaryPolicy = policies.find((policy) => policy.path === canaryTaskPath)
      if (canaryPolicy) {
        const comparisonStart = new Date(
          input.snapshot.checkedAt.getTime() - REQUIRED_OBSERVATION_MS,
        )
        const expectedWindows = scheduledFireTimesBetween(
          canaryPolicy.expectedCronExpression,
          comparisonStart,
          input.snapshot.checkedAt,
        ).filter((scheduledFor) => scheduledFor.getTime() >= comparisonStart.getTime())
        const actualWindows = new Set(
          canary.scheduledFor.map((scheduledFor) => scheduledFor.toISOString()),
        )
        const missingWindows = expectedWindows.filter(
          (scheduledFor) => !actualWindows.has(scheduledFor.toISOString()),
        )
        if (missingWindows.length > 0) {
          blockers.push(
            `canary ledger is missing ${missingWindows.length} scheduled window(s) in the last 48 hours`,
          )
        }
        if (actualWindows.size !== canary.scheduledFor.length) {
          blockers.push("canary observation contains duplicate scheduled windows")
        }
        if (canary.succeeded !== actualWindows.size) {
          blockers.push(
            `canary has ${canary.succeeded} successful execution(s) for ${actualWindows.size} ledger window(s)`,
          )
        }
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
