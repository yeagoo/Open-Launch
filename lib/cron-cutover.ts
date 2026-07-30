import {
  CronLedgerConfigurationError,
  isSafeCronTaskPath,
  parseCronSchedulerMode,
  type CronSchedulerMode,
} from "@/lib/cron-ledger-core"
import { allCronPoliciesApproved, cronTaskPolicies, type CronTaskPolicy } from "@/lib/cron-policy"

export const CRON_CANARY_TASK_ENV = "CRON_LEDGER_CANARY_TASK_PATH"

export type CronRuntimeAuthority =
  | {
      mode: "legacy" | "shadow"
      canaryTaskPath: null
      ledgerTaskPaths: undefined
    }
  | {
      mode: "canary"
      canaryTaskPath: `/api/cron/${string}`
      ledgerTaskPaths: readonly [`/api/cron/${string}`]
    }
  | {
      mode: "ledger"
      canaryTaskPath: null
      ledgerTaskPaths: readonly `/api/cron/${string}`[]
    }

export interface CronLedgerSchedulePolicySnapshot {
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

/**
 * Resolve the scheduler's authority boundary from reviewed code policy and
 * runtime configuration. Environment configuration selects an already
 * approved policy; it cannot approve a policy by itself.
 */
export function resolveCronRuntimeAuthority(
  environment: Readonly<Record<string, string | undefined>>,
  policies: readonly CronTaskPolicy[] = cronTaskPolicies,
): CronRuntimeAuthority {
  const mode = parseCronSchedulerMode(environment.CRON_SCHEDULER_MODE)
  const configuredCanaryPath = environment.CRON_LEDGER_CANARY_TASK_PATH?.trim()

  if (mode !== "canary") {
    if (configuredCanaryPath) {
      throw new CronLedgerConfigurationError(
        `${CRON_CANARY_TASK_ENV} must be unset unless CRON_SCHEDULER_MODE=canary`,
      )
    }
    if (mode === "ledger") {
      if (!allCronPoliciesApproved(policies)) {
        throw new CronLedgerConfigurationError(
          "cron ledger mode is blocked: all task policies must be approved",
        )
      }
      return {
        mode,
        canaryTaskPath: null,
        ledgerTaskPaths: policies.map((policy) => policy.path),
      }
    }
    return { mode, canaryTaskPath: null, ledgerTaskPaths: undefined }
  }

  if (!configuredCanaryPath || !isSafeCronTaskPath(configuredCanaryPath)) {
    throw new CronLedgerConfigurationError(
      `${CRON_CANARY_TASK_ENV} must be one safe direct /api/cron/* task path`,
    )
  }
  const policy = policies.find((candidate) => candidate.path === configuredCanaryPath)
  if (!policy) {
    throw new CronLedgerConfigurationError(
      `${CRON_CANARY_TASK_ENV} is not present in the reviewed policy inventory`,
    )
  }
  if (policy.decision !== "approved") {
    throw new CronLedgerConfigurationError(
      `${CRON_CANARY_TASK_ENV} policy must be explicitly approved in code`,
    )
  }
  if (policy.idempotency !== "strict") {
    throw new CronLedgerConfigurationError(
      `${CRON_CANARY_TASK_ENV} must use strict end-to-end idempotency`,
    )
  }
  const concurrencyGroupMembers = policies.filter(
    (candidate) => candidate.concurrencyGroup === policy.concurrencyGroup,
  )
  if (concurrencyGroupMembers.length !== 1) {
    throw new CronLedgerConfigurationError(
      `${CRON_CANARY_TASK_ENV} must use a concurrency group exclusive to that task during mixed authority`,
    )
  }
  return {
    mode,
    canaryTaskPath: configuredCanaryPath,
    ledgerTaskPaths: [configuredCanaryPath],
  }
}

export function cronTaskAuthority(
  taskPath: string,
  authority: CronRuntimeAuthority,
): "legacy" | "ledger" {
  return authority.mode === "ledger" ||
    (authority.mode === "canary" && authority.canaryTaskPath === taskPath)
    ? "ledger"
    : "legacy"
}

export function assertCronCanarySchedulePolicy(
  authority: Extract<CronRuntimeAuthority, { mode: "canary" }>,
  schedule: CronLedgerSchedulePolicySnapshot,
  policies: readonly CronTaskPolicy[] = cronTaskPolicies,
): void {
  const policy = policies.find((candidate) => candidate.path === authority.canaryTaskPath)
  if (!policy) {
    throw new CronLedgerConfigurationError("canary policy disappeared from code inventory")
  }
  if (schedule.path !== authority.canaryTaskPath) {
    throw new CronLedgerConfigurationError("canary materializer selected an unexpected task path")
  }
  if (!schedule.enabled) {
    throw new CronLedgerConfigurationError(`canary schedule is disabled: ${schedule.path}`)
  }
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
  const mismatches = (Object.keys(expected) as Array<keyof typeof expected>).filter(
    (key) => schedule[key] !== expected[key],
  )
  if (mismatches.length > 0) {
    throw new CronLedgerConfigurationError(
      `${schedule.path}: database policy drift (${mismatches.join(", ")})`,
    )
  }
}

export function assertCronLedgerScheduleInventory(
  schedules: readonly CronLedgerSchedulePolicySnapshot[],
  policies: readonly CronTaskPolicy[] = cronTaskPolicies,
): void {
  if (!allCronPoliciesApproved(policies)) {
    throw new CronLedgerConfigurationError(
      "cron ledger schedule inventory requires every code policy to be approved",
    )
  }
  const schedulesByPath = new Map(schedules.map((schedule) => [schedule.path, schedule]))
  if (schedulesByPath.size !== schedules.length) {
    throw new CronLedgerConfigurationError("cron ledger schedule inventory has duplicate paths")
  }
  for (const schedule of schedules) {
    if (!policies.some((policy) => policy.path === schedule.path)) {
      throw new CronLedgerConfigurationError(
        `database schedule is absent from approved code inventory: ${schedule.path}`,
      )
    }
  }
  for (const policy of policies) {
    const schedule = schedulesByPath.get(policy.path)
    if (!schedule) {
      throw new CronLedgerConfigurationError(`database schedule is missing: ${policy.path}`)
    }
    const expectedSafetyPolicy = {
      misfirePolicy: policy.misfirePolicy,
      maxCatchUpMinutes: policy.maxCatchUpMinutes,
      retryPolicy: policy.retryPolicy,
      maxAttempts: policy.maxAttempts,
      concurrencyGroup: policy.concurrencyGroup,
      idempotencyClass: policy.idempotency,
      requiresScheduledFor: policy.requiresScheduledFor,
    }
    const mismatches = (
      Object.keys(expectedSafetyPolicy) as Array<keyof typeof expectedSafetyPolicy>
    ).filter((key) => schedule[key] !== expectedSafetyPolicy[key])
    if (mismatches.length > 0) {
      throw new CronLedgerConfigurationError(
        `${schedule.path}: database safety policy drift (${mismatches.join(", ")})`,
      )
    }
  }
}

export function schedulerModeUsesLedgerWorker(mode: CronSchedulerMode): boolean {
  return mode === "canary" || mode === "ledger"
}
