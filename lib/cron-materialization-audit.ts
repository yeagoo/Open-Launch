import { createHash } from "node:crypto"

import {
  CronLedgerConfigurationError,
  floorUtcMinute,
  planCronMaterialization,
  type CronJobExecutionMode,
  type LedgerSchedule,
} from "@/lib/cron-ledger-core"

export type CronMaterializationScopeKind = "all" | "task"
export const CRON_EVIDENCE_RECONCILIATION_LAG_MINUTES = 5

export interface CronMaterializationAuditRecord {
  executionMode: CronJobExecutionMode
  scopeKind: CronMaterializationScopeKind
  taskPath: string | null
  scannedFrom: Date
  scannedThrough: Date
  cursorWasClamped: boolean
  plannedCount: number
  insertedCount: number
  canaryPlannedCount: number | null
  canaryInsertedCount: number | null
  policyFingerprint: string
  canaryPolicyFingerprint: string | null
  createdAt: Date
}

export interface CronMaterializedJobObservation {
  taskPath: string
  scheduledFor: Date
  executionMode: CronJobExecutionMode
  status: string
  statusCode: number | null
}

export interface CronLegacyAttemptObservation {
  taskPath: string
  dispatchedAt: Date
  statusCode: number
}

export interface CronMaterializationEvidence {
  auditRuns: number
  continuityGapMinutes: number
  overlappingAuditRuns: number
  clampedRuns: number
  overCatchUpRuns: number
  countMismatchRuns: number
  candidateCountMismatchRuns: number
  scopePolicyDriftRuns: number
  canaryPolicyDriftRuns: number
  expectedJobs: number
  actualJobs: number
  missingJobs: number
  extraJobs: number
  candidate: {
    taskPath: string
    expectedWindows: number
    actualWindows: number
    missingJobs: number
    extraJobs: number
    sameMinuteSuccess: number
    boundedDeferredSuccess: number
    failedAttempt: number
    unexplainedMissing: number
    unexpectedExtra: number
    succeededLedgerJobs: number
    unsuccessfulLedgerJobs: number
  } | null
  nonCandidateMissingByTask: Array<{ taskPath: string; count: number }>
}

const MINUTE_MS = 60_000

export function cronSchedulePolicyFingerprint(schedules: readonly LedgerSchedule[]): string {
  const canonical = [...schedules]
    .sort((left, right) => left.path.localeCompare(right.path))
    .map((schedule) => ({
      path: schedule.path,
      enabled: schedule.enabled,
      cronExpression: schedule.cronExpression,
      updatedAt: schedule.updatedAt.toISOString(),
      misfirePolicy: schedule.misfirePolicy,
      maxCatchUpMinutes: schedule.maxCatchUpMinutes,
      retryPolicy: schedule.retryPolicy,
      maxAttempts: schedule.maxAttempts,
      concurrencyGroup: schedule.concurrencyGroup,
      idempotencyClass: schedule.idempotencyClass,
      requiresScheduledFor: schedule.requiresScheduledFor,
    }))
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex")
}

export function evaluateCronMaterializationEvidence(input: {
  checkedAt: Date
  observationMinutes: number
  reconciliationLagMinutes: number
  executionMode: CronJobExecutionMode
  scopeKind: CronMaterializationScopeKind
  scopeTaskPath: string | null
  canaryTaskPath: string | null
  schedules: readonly LedgerSchedule[]
  audits: readonly CronMaterializationAuditRecord[]
  jobs: readonly CronMaterializedJobObservation[]
  legacyAttempts: readonly CronLegacyAttemptObservation[]
}): CronMaterializationEvidence {
  if (
    !Number.isFinite(input.checkedAt.getTime()) ||
    !Number.isInteger(input.observationMinutes) ||
    input.observationMinutes < 1 ||
    input.observationMinutes > 10_080 ||
    !Number.isInteger(input.reconciliationLagMinutes) ||
    input.reconciliationLagMinutes < 0 ||
    input.reconciliationLagMinutes > 60
  ) {
    throw new CronLedgerConfigurationError("cron materialization evidence window is invalid")
  }
  const observationEnd = new Date(
    floorUtcMinute(input.checkedAt).getTime() - input.reconciliationLagMinutes * MINUTE_MS,
  )
  const observationStart = new Date(observationEnd.getTime() - input.observationMinutes * MINUTE_MS)
  const scopeSchedules = selectScopeSchedules(input.schedules, input.scopeKind, input.scopeTaskPath)
  const expectedScopeFingerprint = cronSchedulePolicyFingerprint(scopeSchedules)
  const canarySchedule = input.canaryTaskPath
    ? input.schedules.find((schedule) => schedule.path === input.canaryTaskPath)
    : undefined
  const expectedCanaryFingerprint = canarySchedule
    ? cronSchedulePolicyFingerprint([canarySchedule])
    : null

  const relevantAudits = input.audits
    .filter(
      (audit) =>
        audit.executionMode === input.executionMode &&
        audit.scopeKind === input.scopeKind &&
        audit.taskPath === input.scopeTaskPath &&
        audit.scannedThrough.getTime() >= observationStart.getTime() &&
        audit.scannedFrom.getTime() <= observationEnd.getTime(),
    )
    .sort(
      (left, right) =>
        left.scannedFrom.getTime() - right.scannedFrom.getTime() ||
        left.scannedThrough.getTime() - right.scannedThrough.getTime(),
    )

  let nextUncoveredMinute = observationStart.getTime()
  let hasCoveredAudit = false
  let continuityGapMinutes = 0
  let overlappingAuditRuns = 0
  let countMismatchRuns = 0
  let candidateCountMismatchRuns = 0
  const expectedJobKeys = new Set<string>()
  const expectedJobsByKey = new Map<string, { taskPath: string; scheduledFor: Date }>()

  for (const audit of relevantAudits) {
    const scannedFrom = audit.scannedFrom.getTime()
    const scannedThrough = audit.scannedThrough.getTime()
    if (
      hasCoveredAudit &&
      scannedFrom < nextUncoveredMinute &&
      scannedThrough >= nextUncoveredMinute
    ) {
      overlappingAuditRuns += 1
    }
    if (scannedFrom > nextUncoveredMinute) {
      continuityGapMinutes += Math.round((scannedFrom - nextUncoveredMinute) / MINUTE_MS)
    }
    nextUncoveredMinute = Math.max(nextUncoveredMinute, scannedThrough + MINUTE_MS)
    hasCoveredAudit = true

    const spanMinutes = Math.round((scannedThrough - scannedFrom) / MINUTE_MS) + 1
    const plan = planCronMaterialization({
      cursorScannedThrough: new Date(scannedFrom - MINUTE_MS),
      now: audit.scannedThrough,
      schedules: scopeSchedules,
      globalCatchUpMinutes: Math.max(1, Math.min(spanMinutes, 10_080)),
    })
    if (plan.jobs.length !== audit.plannedCount || audit.insertedCount > audit.plannedCount) {
      countMismatchRuns += 1
    }
    const plannedCanaryCount = input.canaryTaskPath
      ? plan.jobs.filter((job) => job.taskPath === input.canaryTaskPath).length
      : null
    if (
      plannedCanaryCount !== audit.canaryPlannedCount ||
      (audit.canaryInsertedCount !== null &&
        audit.canaryPlannedCount !== null &&
        audit.canaryInsertedCount > audit.canaryPlannedCount)
    ) {
      candidateCountMismatchRuns += 1
    }
    for (const job of plan.jobs) {
      if (
        job.scheduledFor.getTime() < observationStart.getTime() ||
        job.scheduledFor.getTime() > observationEnd.getTime()
      ) {
        continue
      }
      const key = jobKey(job.taskPath, job.scheduledFor)
      expectedJobKeys.add(key)
      expectedJobsByKey.set(key, job)
    }
  }
  if (nextUncoveredMinute <= observationEnd.getTime()) {
    continuityGapMinutes +=
      Math.round((observationEnd.getTime() - nextUncoveredMinute) / MINUTE_MS) + 1
  }

  const actualJobs = input.jobs.filter(
    (job) =>
      job.executionMode === input.executionMode &&
      job.scheduledFor.getTime() >= observationStart.getTime() &&
      job.scheduledFor.getTime() <= observationEnd.getTime() &&
      (input.scopeKind === "all" || job.taskPath === input.scopeTaskPath),
  )
  const actualJobsByKey = new Map(
    actualJobs.map((job) => [jobKey(job.taskPath, job.scheduledFor), job]),
  )
  const missingJobs = [...expectedJobKeys].filter((key) => !actualJobsByKey.has(key)).length
  const extraJobs = [...actualJobsByKey.keys()].filter((key) => !expectedJobKeys.has(key)).length

  const candidate =
    input.canaryTaskPath && canarySchedule
      ? classifyCandidate({
          taskPath: input.canaryTaskPath,
          schedule: canarySchedule,
          executionMode: input.executionMode,
          expectedJobsByKey,
          actualJobsByKey,
          legacyAttempts: input.legacyAttempts,
          observationStart,
          observationEnd,
        })
      : null

  const successfulLegacyKeys = new Set(
    input.legacyAttempts
      .filter((attempt) => attempt.statusCode >= 200 && attempt.statusCode < 300)
      .map((attempt) => jobKey(attempt.taskPath, floorUtcMinute(attempt.dispatchedAt))),
  )
  const nonCandidateMissing = new Map<string, number>()
  for (const [key, expectedJob] of expectedJobsByKey) {
    if (expectedJob.taskPath === input.canaryTaskPath || successfulLegacyKeys.has(key)) continue
    nonCandidateMissing.set(
      expectedJob.taskPath,
      (nonCandidateMissing.get(expectedJob.taskPath) ?? 0) + 1,
    )
  }

  return {
    auditRuns: relevantAudits.length,
    continuityGapMinutes,
    overlappingAuditRuns,
    clampedRuns: relevantAudits.filter((audit) => audit.cursorWasClamped).length,
    overCatchUpRuns: canarySchedule
      ? relevantAudits.filter(
          (audit) =>
            (audit.scannedThrough.getTime() - audit.scannedFrom.getTime()) / MINUTE_MS >
            (canarySchedule.maxCatchUpMinutes ?? 0),
        ).length
      : 0,
    countMismatchRuns,
    candidateCountMismatchRuns,
    scopePolicyDriftRuns: relevantAudits.filter(
      (audit) => audit.policyFingerprint !== expectedScopeFingerprint,
    ).length,
    canaryPolicyDriftRuns: relevantAudits.filter(
      (audit) => audit.canaryPolicyFingerprint !== expectedCanaryFingerprint,
    ).length,
    expectedJobs: expectedJobKeys.size,
    actualJobs: actualJobsByKey.size,
    missingJobs,
    extraJobs,
    candidate,
    nonCandidateMissingByTask: [...nonCandidateMissing]
      .map(([taskPath, count]) => ({ taskPath, count }))
      .sort((left, right) => left.taskPath.localeCompare(right.taskPath)),
  }
}

function selectScopeSchedules(
  schedules: readonly LedgerSchedule[],
  scopeKind: CronMaterializationScopeKind,
  taskPath: string | null,
): LedgerSchedule[] {
  if (scopeKind === "all") return [...schedules]
  return schedules.filter((schedule) => schedule.path === taskPath)
}

function classifyCandidate(input: {
  taskPath: string
  schedule: LedgerSchedule
  executionMode: CronJobExecutionMode
  expectedJobsByKey: ReadonlyMap<string, { taskPath: string; scheduledFor: Date }>
  actualJobsByKey: ReadonlyMap<string, CronMaterializedJobObservation>
  legacyAttempts: readonly CronLegacyAttemptObservation[]
  observationStart: Date
  observationEnd: Date
}): NonNullable<CronMaterializationEvidence["candidate"]> {
  const expectedWindows = [...input.expectedJobsByKey.values()].filter(
    (job) => job.taskPath === input.taskPath,
  )
  const actualWindows = [...input.actualJobsByKey.values()].filter(
    (job) => job.taskPath === input.taskPath,
  )
  const attempts = input.legacyAttempts
    .filter(
      (attempt) =>
        attempt.taskPath === input.taskPath &&
        attempt.dispatchedAt.getTime() >= input.observationStart.getTime() &&
        attempt.dispatchedAt.getTime() <= input.observationEnd.getTime() + MINUTE_MS - 1,
    )
    .sort((left, right) => left.dispatchedAt.getTime() - right.dispatchedAt.getTime())
  const expectedMinuteKeys = new Set(
    expectedWindows.map((job) => floorUtcMinute(job.scheduledFor).toISOString()),
  )
  const legacyMinuteKeys = new Set(
    attempts.map((attempt) => floorUtcMinute(attempt.dispatchedAt).toISOString()),
  )

  let sameMinuteSuccess = 0
  let boundedDeferredSuccess = 0
  let failedAttempt = 0
  let unexplainedMissing = 0
  for (const expected of expectedWindows) {
    const scheduledAt = expected.scheduledFor.getTime()
    const sameMinuteAttempts = attempts.filter(
      (attempt) => floorUtcMinute(attempt.dispatchedAt).getTime() === scheduledAt,
    )
    if (sameMinuteAttempts.some(isSuccessfulAttempt)) {
      sameMinuteSuccess += 1
      continue
    }
    const deferredDeadline = scheduledAt + (input.schedule.maxCatchUpMinutes ?? 0) * MINUTE_MS
    const deferred = attempts.some(
      (attempt) =>
        attempt.dispatchedAt.getTime() > scheduledAt + MINUTE_MS - 1 &&
        attempt.dispatchedAt.getTime() <= deferredDeadline + MINUTE_MS - 1 &&
        isSuccessfulAttempt(attempt),
    )
    if (deferred) {
      boundedDeferredSuccess += 1
    } else if (sameMinuteAttempts.length > 0) {
      failedAttempt += 1
    } else {
      unexplainedMissing += 1
    }
  }

  return {
    taskPath: input.taskPath,
    expectedWindows: expectedWindows.length,
    actualWindows: actualWindows.length,
    missingJobs: expectedWindows.filter(
      (job) => !input.actualJobsByKey.has(jobKey(job.taskPath, job.scheduledFor)),
    ).length,
    extraJobs: actualWindows.filter(
      (job) => !input.expectedJobsByKey.has(jobKey(job.taskPath, job.scheduledFor)),
    ).length,
    sameMinuteSuccess,
    boundedDeferredSuccess,
    failedAttempt,
    unexplainedMissing,
    unexpectedExtra: [...legacyMinuteKeys].filter((key) => !expectedMinuteKeys.has(key)).length,
    succeededLedgerJobs: actualWindows.filter((job) => job.status === "succeeded").length,
    unsuccessfulLedgerJobs: actualWindows.filter((job) => job.status !== "succeeded").length,
  }
}

function isSuccessfulAttempt(attempt: CronLegacyAttemptObservation): boolean {
  return attempt.statusCode >= 200 && attempt.statusCode < 300
}

function jobKey(taskPath: string, scheduledFor: Date): string {
  return `${taskPath}\u0000${floorUtcMinute(scheduledFor).toISOString()}`
}
