import { isValidCronExpression, scheduledFireTimesBetween } from "@/lib/cron-match"
import type { CronIdempotencyClass, CronMisfirePolicy, CronRetryPolicy } from "@/lib/cron-policy"

export const CRON_JOB_ERROR_MAX_LENGTH = 2000
export const DEFAULT_GLOBAL_CATCH_UP_MINUTES = 1440

export type CronSchedulerMode = "legacy" | "shadow" | "canary" | "ledger"
export type CronMaterializationPolicy = CronMisfirePolicy | "bounded-all"
export type CronJobExecutionMode = "shadow" | "ledger"
export type CronJobStatus =
  "pending" | "running" | "retry_wait" | "succeeded" | "dead_lettered" | "uncertain" | "cancelled"

export interface LedgerSchedule {
  id: number
  path: string
  cronExpression: string
  enabled: boolean
  updatedAt: Date
  misfirePolicy: CronMaterializationPolicy | null
  maxCatchUpMinutes: number | null
  retryPolicy: CronRetryPolicy | null
  maxAttempts: number | null
  concurrencyGroup: string | null
  idempotencyClass: CronIdempotencyClass | null
  requiresScheduledFor: boolean | null
}

export interface CronJobPlan {
  scheduleId: number
  taskPath: string
  scheduledFor: Date
  cronExpression: string
  misfirePolicy: CronMaterializationPolicy
  maxCatchUpMinutes: number
  retryPolicy: CronRetryPolicy
  maxAttempts: number
  concurrencyGroup: string
  idempotencyClass: CronIdempotencyClass
  requiresScheduledFor: boolean
  scheduleVersion: string
}

export interface CronMaterializationPlan {
  scannedFrom: Date
  scannedThrough: Date
  cursorWasClamped: boolean
  jobs: CronJobPlan[]
}

export class CronLedgerConfigurationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CronLedgerConfigurationError"
  }
}

export function parseCronSchedulerMode(value: string | undefined): CronSchedulerMode {
  const normalized = value?.trim() || "legacy"
  if (
    normalized === "legacy" ||
    normalized === "shadow" ||
    normalized === "canary" ||
    normalized === "ledger"
  ) {
    return normalized
  }
  throw new CronLedgerConfigurationError(
    `CRON_SCHEDULER_MODE must be legacy, shadow, canary, or ledger; received ${JSON.stringify(normalized)}`,
  )
}

export function parseBooleanEnv(
  value: string | undefined,
  fallback: boolean,
  name: string,
): boolean {
  if (value === undefined || value.trim() === "") return fallback
  const normalized = value.trim().toLowerCase()
  if (normalized === "true" || normalized === "1") return true
  if (normalized === "false" || normalized === "0") return false
  throw new CronLedgerConfigurationError(`${name} must be true, false, 1, or 0`)
}

export function isSafeCronTaskPath(path: string): path is `/api/cron/${string}` {
  if (!path.startsWith("/api/cron/")) return false
  if (path === "/api/cron/dispatch") return false
  if (path.includes("?") || path.includes("#") || path.includes("..") || path.includes("://")) {
    return false
  }
  return /^\/api\/cron\/[a-z0-9-]+$/.test(path)
}

export function normalizeCronTaskPathAllowlist(
  paths: readonly string[] | undefined,
  name = "cron task allowlist",
): Array<`/api/cron/${string}`> | undefined {
  if (paths === undefined) return undefined
  if (paths.length === 0) {
    throw new CronLedgerConfigurationError(`${name} must contain at least one task path`)
  }
  const normalized = [...new Set(paths.map((path) => path.trim()))]
  if (
    normalized.length !== paths.length ||
    normalized.length > 100 ||
    normalized.some((path) => !isSafeCronTaskPath(path))
  ) {
    throw new CronLedgerConfigurationError(`${name} contains duplicate or unsafe task paths`)
  }
  return normalized as Array<`/api/cron/${string}`>
}

export function resolveInternalCronBaseUrl(value: string | undefined, port = "3000"): string {
  const raw = value?.trim() || `http://127.0.0.1:${port}`
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new CronLedgerConfigurationError("INTERNAL_BASE_URL is not a valid URL")
  }
  const hostname = url.hostname.toLowerCase()
  const isLoopback = hostname === "127.0.0.1" || hostname === "localhost" || hostname === "[::1]"
  const isComposeService = /^[a-z0-9][a-z0-9-]{0,62}$/.test(hostname)
  if (
    url.protocol !== "http:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    (!isLoopback && !isComposeService)
  ) {
    throw new CronLedgerConfigurationError(
      "INTERNAL_BASE_URL must be a credential-free HTTP loopback or Compose service origin",
    )
  }
  return url.origin
}

export function floorUtcMinute(value: Date): Date {
  const result = new Date(value)
  result.setUTCSeconds(0, 0)
  return result
}

export function parseCronScheduledFor(
  value: string | null,
  now: Date,
  maxAgeMinutes: number,
): Date | null {
  if (value === null) return null
  const parsed = new Date(value)
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString() !== value ||
    floorUtcMinute(parsed).getTime() !== parsed.getTime()
  ) {
    throw new CronLedgerConfigurationError(
      "X-AAT-Cron-Scheduled-For must be a canonical UTC minute",
    )
  }
  const ageMinutes = (floorUtcMinute(now).getTime() - parsed.getTime()) / 60_000
  if (ageMinutes < 0 || ageMinutes > maxAgeMinutes) {
    throw new CronLedgerConfigurationError(
      "X-AAT-Cron-Scheduled-For is outside the task catch-up window",
    )
  }
  return parsed
}

export function nextFullMinute(value: Date): Date {
  const floor = floorUtcMinute(value)
  return floor.getTime() === value.getTime() ? floor : new Date(floor.getTime() + 60_000)
}

export function previousUtcCalendarMonth(executionTime: Date): {
  windowStart: Date
  windowEnd: Date
  monthLabel: string
  slugSuffix: string
} {
  if (!Number.isFinite(executionTime.getTime())) {
    throw new CronLedgerConfigurationError("cron execution time is invalid")
  }
  const windowEnd = new Date(
    Date.UTC(executionTime.getUTCFullYear(), executionTime.getUTCMonth(), 1),
  )
  const windowStart = new Date(
    Date.UTC(executionTime.getUTCFullYear(), executionTime.getUTCMonth() - 1, 1),
  )
  return {
    windowStart,
    windowEnd,
    monthLabel: windowStart.toLocaleString("en-US", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }),
    slugSuffix: `${windowStart.getUTCFullYear()}-${String(windowStart.getUTCMonth() + 1).padStart(
      2,
      "0",
    )}`,
  }
}

export function planCronMaterialization(input: {
  cursorScannedThrough: Date | null
  now: Date
  schedules: readonly LedgerSchedule[]
  globalCatchUpMinutes?: number
}): CronMaterializationPlan {
  const target = floorUtcMinute(input.now)
  if (!Number.isFinite(target.getTime())) {
    throw new CronLedgerConfigurationError("materialization now is invalid")
  }
  const globalCatchUpMinutes = input.globalCatchUpMinutes ?? DEFAULT_GLOBAL_CATCH_UP_MINUTES
  if (
    !Number.isInteger(globalCatchUpMinutes) ||
    globalCatchUpMinutes < 1 ||
    globalCatchUpMinutes > 10_080
  ) {
    throw new CronLedgerConfigurationError(
      "globalCatchUpMinutes must be an integer between 1 and 10080",
    )
  }

  const cursor = input.cursorScannedThrough
    ? floorUtcMinute(input.cursorScannedThrough)
    : new Date(target.getTime() - 60_000)
  if (!Number.isFinite(cursor.getTime())) {
    throw new CronLedgerConfigurationError("materialization cursor is invalid")
  }
  if (cursor.getTime() > target.getTime()) {
    throw new CronLedgerConfigurationError("materialization cursor is ahead of the current minute")
  }

  const desiredStart = new Date(cursor.getTime() + 60_000)
  const earliestAllowed = new Date(target.getTime() - (globalCatchUpMinutes - 1) * 60_000)
  const scannedFrom =
    desiredStart.getTime() < earliestAllowed.getTime() ? earliestAllowed : desiredStart
  const cursorWasClamped = scannedFrom.getTime() !== desiredStart.getTime()
  const jobs: CronJobPlan[] = []

  for (const schedule of input.schedules) {
    if (!schedule.enabled) continue
    assertSchedulePolicy(schedule)

    // An edit applies from the next complete UTC minute. We cannot safely
    // reconstruct the prior expression without schedule-version history, so
    // never apply the new expression retroactively to an older missed minute.
    const effectiveFrom = nextFullMinute(schedule.updatedAt)
    const due = scheduledFireTimesBetween(
      schedule.cronExpression,
      scannedFrom,
      target,
      globalCatchUpMinutes + 1,
    ).filter((minute) => minute.getTime() >= effectiveFrom.getTime())
    const withinTaskWindow = due.filter(
      (minute) => (target.getTime() - minute.getTime()) / 60_000 <= schedule.maxCatchUpMinutes!,
    )

    let selected: Date[]
    if (schedule.misfirePolicy === "skip") {
      selected = withinTaskWindow.filter((minute) => minute.getTime() === target.getTime())
    } else if (schedule.misfirePolicy === "latest") {
      selected = withinTaskWindow.length > 0 ? [withinTaskWindow[withinTaskWindow.length - 1]] : []
    } else {
      selected = withinTaskWindow
    }

    for (const scheduledFor of selected) {
      jobs.push({
        scheduleId: schedule.id,
        taskPath: schedule.path,
        scheduledFor,
        cronExpression: schedule.cronExpression,
        misfirePolicy: schedule.misfirePolicy!,
        maxCatchUpMinutes: schedule.maxCatchUpMinutes!,
        retryPolicy: schedule.retryPolicy!,
        maxAttempts: schedule.maxAttempts!,
        concurrencyGroup: schedule.concurrencyGroup!,
        idempotencyClass: schedule.idempotencyClass!,
        requiresScheduledFor: schedule.requiresScheduledFor!,
        scheduleVersion: schedule.updatedAt.toISOString(),
      })
    }
  }

  jobs.sort(
    (left, right) =>
      left.scheduledFor.getTime() - right.scheduledFor.getTime() ||
      left.taskPath.localeCompare(right.taskPath),
  )
  return { scannedFrom, scannedThrough: target, cursorWasClamped, jobs }
}

export function expiredLeaseDisposition(input: {
  idempotencyClass: CronIdempotencyClass
  attemptCount: number
  maxAttempts: number
}): "retry_wait" | "dead_lettered" | "uncertain" {
  if (input.idempotencyClass === "strict") {
    return input.attemptCount < input.maxAttempts ? "retry_wait" : "dead_lettered"
  }
  return "uncertain"
}

export function failedAttemptDisposition(input: {
  retryPolicy: CronRetryPolicy
  idempotencyClass: CronIdempotencyClass
  attemptCount: number
  maxAttempts: number
  statusCode: number
}): "retry_wait" | "dead_lettered" | "uncertain" {
  // A transport timeout does not prove that the internal route failed before
  // its external side effect. Only a strict end-to-end idempotency key makes
  // blind retry safe; all weaker classes require reconciliation.
  if (input.statusCode === 0 && input.idempotencyClass !== "strict") {
    return "uncertain"
  }
  const transient = input.statusCode === 0 || input.statusCode === 429 || input.statusCode >= 500
  return input.retryPolicy === "transient-bounded" &&
    transient &&
    input.attemptCount < input.maxAttempts
    ? "retry_wait"
    : "dead_lettered"
}

export function retryAvailableAt(attemptCount: number, now: Date): Date {
  const safeAttempt = Math.max(1, Math.min(attemptCount, 10))
  const delaySeconds = Math.min(30 * 2 ** (safeAttempt - 1), 900)
  return new Date(now.getTime() + delaySeconds * 1000)
}

export function sanitizeCronJobError(error: unknown): string {
  const raw = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  const sanitized = raw
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\bBearer\s+[^\s,;]+/gi, "Bearer [redacted]")
    .replace(/([?&][^=\s&]+)=([^&\s]+)/g, "$1=[redacted]")
    .replace(/(postgres(?:ql)?|redis):\/\/[^@\s]+@/gi, "$1://[redacted]@")
    .trim()
  return (sanitized || "Unknown cron worker error").slice(0, CRON_JOB_ERROR_MAX_LENGTH)
}

function assertSchedulePolicy(schedule: LedgerSchedule): asserts schedule is LedgerSchedule & {
  path: `/api/cron/${string}`
  misfirePolicy: CronMaterializationPolicy
  maxCatchUpMinutes: number
  retryPolicy: CronRetryPolicy
  maxAttempts: number
  concurrencyGroup: string
  idempotencyClass: CronIdempotencyClass
  requiresScheduledFor: boolean
} {
  const prefix = `cron schedule ${schedule.path}`
  if (!isSafeCronTaskPath(schedule.path)) {
    throw new CronLedgerConfigurationError(`${prefix} has an unsafe task path`)
  }
  if (!isValidCronExpression(schedule.cronExpression)) {
    throw new CronLedgerConfigurationError(`${prefix} has an invalid cron expression`)
  }
  if (
    schedule.misfirePolicy !== "skip" &&
    schedule.misfirePolicy !== "latest" &&
    schedule.misfirePolicy !== "bounded-all"
  ) {
    throw new CronLedgerConfigurationError(`${prefix} is missing a valid misfire policy`)
  }
  if (
    schedule.maxCatchUpMinutes === null ||
    !Number.isInteger(schedule.maxCatchUpMinutes) ||
    schedule.maxCatchUpMinutes < 0 ||
    schedule.maxCatchUpMinutes > 43_200
  ) {
    throw new CronLedgerConfigurationError(`${prefix} has invalid max catch-up minutes`)
  }
  if (
    schedule.retryPolicy !== "none" &&
    schedule.retryPolicy !== "next-schedule" &&
    schedule.retryPolicy !== "transient-bounded" &&
    schedule.retryPolicy !== "handler-managed"
  ) {
    throw new CronLedgerConfigurationError(`${prefix} is missing a valid retry policy`)
  }
  if (
    schedule.maxAttempts === null ||
    !Number.isInteger(schedule.maxAttempts) ||
    schedule.maxAttempts < 1 ||
    schedule.maxAttempts > 20
  ) {
    throw new CronLedgerConfigurationError(`${prefix} has invalid max attempts`)
  }
  if (!schedule.concurrencyGroup?.trim() || schedule.concurrencyGroup.length > 100) {
    throw new CronLedgerConfigurationError(`${prefix} has invalid concurrency group`)
  }
  if (
    schedule.idempotencyClass !== "strict" &&
    schedule.idempotencyClass !== "guarded" &&
    schedule.idempotencyClass !== "convergent" &&
    schedule.idempotencyClass !== "non-idempotent"
  ) {
    throw new CronLedgerConfigurationError(`${prefix} has invalid idempotency class`)
  }
  if (typeof schedule.requiresScheduledFor !== "boolean") {
    throw new CronLedgerConfigurationError(`${prefix} is missing requires-scheduled-for`)
  }
  if (!Number.isFinite(schedule.updatedAt.getTime())) {
    throw new CronLedgerConfigurationError(`${prefix} has an invalid updated-at value`)
  }
}
