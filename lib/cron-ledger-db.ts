import "server-only"

import { hostname } from "node:os"

import { db } from "@/drizzle/db"
import { cronJob, cronMaterializationCursor, cronRunLog, cronSchedule } from "@/drizzle/db/schema"
import { and, asc, eq, inArray, lte, or, sql } from "drizzle-orm"

import {
  assertCronCanarySchedulePolicy,
  assertCronLedgerScheduleInventory,
  resolveCronRuntimeAuthority,
  type CronRuntimeAuthority,
} from "@/lib/cron-cutover"
import {
  expiredLeaseDisposition,
  failedAttemptDisposition,
  floorUtcMinute,
  isSafeCronTaskPath,
  normalizeCronTaskPathAllowlist,
  planCronMaterialization,
  resolveInternalCronBaseUrl,
  retryAvailableAt,
  sanitizeCronJobError,
  type CronJobExecutionMode,
  type LedgerSchedule,
} from "@/lib/cron-ledger-core"
import {
  allCronPoliciesApproved,
  type CronIdempotencyClass,
  type CronRetryPolicy,
} from "@/lib/cron-policy"
import { fetchWithTimeout, withTimeout } from "@/lib/fetch-timeout"
import { logger } from "@/lib/observability/structured-logger"

const CURSOR_ID = "main"
const DEFAULT_LEASE_MS = 300_000
const RENEW_INTERVAL_MS = 60_000
const TASK_TIMEOUT_MS = 240_000
const EXPIRED_RECOVERY_BATCH = 100
const CLAIM_CANDIDATE_BATCH = 25

type CronJobRow = typeof cronJob.$inferSelect

export interface CronMaterializationResult {
  mode: CronJobExecutionMode
  scannedFrom: string
  scannedThrough: string
  cursorWasClamped: boolean
  plannedCount: number
  insertedCount: number
  materializationLagSeconds: number
}

export interface ClaimedCronJob extends CronJobRow {
  executionMode: "ledger"
  status: "running"
  leaseOwner: string
  leaseToken: string
  leaseExpiresAt: Date
}

export interface CronWorkerResult {
  path: string
  statusCode: number
  durationMs: number
  jobId: string
  scheduledFor: string
  error?: string
}

export async function materializeCronLedger(
  mode: CronJobExecutionMode,
  now = new Date(),
  options: { allowedTaskPaths?: readonly string[] } = {},
): Promise<CronMaterializationResult> {
  const allowedTaskPaths = normalizeCronTaskPathAllowlist(
    options.allowedTaskPaths,
    "cron materializer allowlist",
  )
  let canaryAuthority: Extract<CronRuntimeAuthority, { mode: "canary" }> | undefined
  if (mode === "ledger") {
    if (allowedTaskPaths === undefined) {
      if (!allCronPoliciesApproved()) {
        throw new Error("cron ledger mode is blocked: Phase 0 task policies are not all approved")
      }
    } else {
      if (allowedTaskPaths.length !== 1) {
        throw new Error("cron canary materialization requires exactly one task path")
      }
      const authority = resolveCronRuntimeAuthority({
        CRON_SCHEDULER_MODE: "canary",
        CRON_LEDGER_CANARY_TASK_PATH: allowedTaskPaths[0],
      })
      if (authority.mode !== "canary") {
        throw new Error("cron canary authority resolution returned an unexpected mode")
      }
      canaryAuthority = authority
    }
  }

  const target = floorUtcMinute(now)
  const globalCatchUpMinutes = boundedIntegerEnv(
    process.env.CRON_LEDGER_GLOBAL_CATCH_UP_MINUTES,
    1440,
    1,
    10_080,
    "CRON_LEDGER_GLOBAL_CATCH_UP_MINUTES",
  )

  return db.transaction(async (tx) => {
    await tx
      .insert(cronMaterializationCursor)
      .values({
        id: CURSOR_ID,
        scannedThrough: new Date(target.getTime() - 60_000),
      })
      .onConflictDoNothing({ target: cronMaterializationCursor.id })

    const [cursor] = await tx
      .select({ scannedThrough: cronMaterializationCursor.scannedThrough })
      .from(cronMaterializationCursor)
      .where(eq(cronMaterializationCursor.id, CURSOR_ID))
      .for("update")
    if (!cursor) throw new Error("cron materialization cursor is missing after initialization")

    const rows = await tx
      .select({
        id: cronSchedule.id,
        path: cronSchedule.path,
        cronExpression: cronSchedule.cronExpression,
        enabled: cronSchedule.enabled,
        updatedAt: cronSchedule.updatedAt,
        misfirePolicy: cronSchedule.misfirePolicy,
        maxCatchUpMinutes: cronSchedule.maxCatchUpMinutes,
        retryPolicy: cronSchedule.retryPolicy,
        maxAttempts: cronSchedule.maxAttempts,
        concurrencyGroup: cronSchedule.concurrencyGroup,
        idempotencyClass: cronSchedule.idempotencyClass,
        requiresScheduledFor: cronSchedule.requiresScheduledFor,
      })
      .from(cronSchedule)

    if (mode === "ledger" && allowedTaskPaths === undefined) {
      assertCronLedgerScheduleInventory(rows)
    }
    const selectedRows = allowedTaskPaths
      ? rows.filter((row) => allowedTaskPaths.includes(row.path as `/api/cron/${string}`))
      : rows
    if (allowedTaskPaths && selectedRows.length !== allowedTaskPaths.length) {
      const selectedPaths = new Set(selectedRows.map((row) => row.path))
      const missing = allowedTaskPaths.filter((path) => !selectedPaths.has(path))
      throw new Error(`cron materializer allowlist is missing schedule rows: ${missing.join(", ")}`)
    }
    if (canaryAuthority) {
      const [canarySchedule] = selectedRows
      if (!canarySchedule) throw new Error("cron canary schedule row is missing")
      assertCronCanarySchedulePolicy(canaryAuthority, canarySchedule)
    }

    const plan = planCronMaterialization({
      cursorScannedThrough: cursor.scannedThrough,
      now: target,
      schedules: selectedRows as LedgerSchedule[],
      globalCatchUpMinutes,
    })

    let insertedCount = 0
    if (plan.jobs.length > 0) {
      const inserted = await tx
        .insert(cronJob)
        .values(
          plan.jobs.map((job) => ({
            scheduleId: job.scheduleId,
            taskPath: job.taskPath,
            scheduledFor: job.scheduledFor,
            executionMode: mode,
            status: mode === "shadow" ? "cancelled" : "pending",
            availableAt: target,
            finishedAt: mode === "shadow" ? target : null,
            cronExpression: job.cronExpression,
            misfirePolicy: job.misfirePolicy,
            maxCatchUpMinutes: job.maxCatchUpMinutes,
            retryPolicy: job.retryPolicy,
            maxAttempts: job.maxAttempts,
            concurrencyGroup: job.concurrencyGroup,
            idempotencyClass: job.idempotencyClass,
            requiresScheduledFor: job.requiresScheduledFor,
            scheduleVersion: job.scheduleVersion,
          })),
        )
        .onConflictDoNothing({ target: [cronJob.taskPath, cronJob.scheduledFor] })
        .returning({ id: cronJob.id })
      insertedCount = inserted.length
    }

    await tx
      .update(cronMaterializationCursor)
      .set({ scannedThrough: plan.scannedThrough, updatedAt: target })
      .where(eq(cronMaterializationCursor.id, CURSOR_ID))

    return {
      mode,
      scannedFrom: plan.scannedFrom.toISOString(),
      scannedThrough: plan.scannedThrough.toISOString(),
      cursorWasClamped: plan.cursorWasClamped,
      plannedCount: plan.jobs.length,
      insertedCount,
      materializationLagSeconds: Math.max(
        0,
        Math.round((target.getTime() - plan.scannedThrough.getTime()) / 1_000),
      ),
    }
  })
}

export async function claimCronJob(
  input: {
    workerId?: string
    now?: Date
    leaseMs?: number
    allowedTaskPaths?: readonly string[]
  } = {},
): Promise<ClaimedCronJob | null> {
  const now = input.now ?? new Date()
  const workerId = sanitizeWorkerId(input.workerId ?? `${hostname()}:${process.pid}`)
  const leaseMs = input.leaseMs ?? DEFAULT_LEASE_MS
  if (!Number.isInteger(leaseMs) || leaseMs < 30_000 || leaseMs > 600_000) {
    throw new Error("cron leaseMs must be an integer between 30000 and 600000")
  }

  const allowedTaskPaths = normalizeCronTaskPathAllowlist(
    input.allowedTaskPaths,
    "cron worker allowlist",
  )

  await recoverExpiredCronLeases(now, allowedTaskPaths)

  const claimed = await db.transaction(async (tx) => {
    const candidates = await tx
      .select()
      .from(cronJob)
      .where(
        and(
          eq(cronJob.executionMode, "ledger"),
          allowedTaskPaths ? inArray(cronJob.taskPath, allowedTaskPaths) : undefined,
          inArray(cronJob.status, ["pending", "retry_wait"]),
          lte(cronJob.availableAt, now),
          sql`${cronJob.attemptCount} < ${cronJob.maxAttempts}`,
          sql`NOT EXISTS (
            SELECT 1
            FROM "cron_job" AS blocker
            WHERE blocker."concurrency_group" = ${cronJob.concurrencyGroup}
              AND blocker."status" IN ('running', 'uncertain')
          )`,
        ),
      )
      .orderBy(asc(cronJob.scheduledFor), asc(cronJob.createdAt))
      .limit(CLAIM_CANDIDATE_BATCH)
      .for("update", { skipLocked: true })

    for (const candidate of candidates) {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`cron-group:${candidate.concurrencyGroup}`}))`,
      )
      const [groupBlocker] = await tx
        .select({ id: cronJob.id })
        .from(cronJob)
        .where(
          and(
            eq(cronJob.concurrencyGroup, candidate.concurrencyGroup),
            or(eq(cronJob.status, "running"), eq(cronJob.status, "uncertain")),
          ),
        )
        .limit(1)
      if (groupBlocker) continue

      const leaseToken = crypto.randomUUID()
      const [claimed] = await tx
        .update(cronJob)
        .set({
          status: "running",
          attemptCount: sql`${cronJob.attemptCount} + 1`,
          leaseOwner: workerId,
          leaseToken,
          leaseExpiresAt: new Date(now.getTime() + leaseMs),
          startedAt: now,
          finishedAt: null,
          statusCode: null,
          durationMs: null,
          lastError: null,
          updatedAt: now,
        })
        .where(
          and(
            eq(cronJob.id, candidate.id),
            inArray(cronJob.status, ["pending", "retry_wait"]),
            sql`${cronJob.attemptCount} < ${cronJob.maxAttempts}`,
          ),
        )
        .returning()
      if (claimed) return claimed as ClaimedCronJob
    }

    return null
  })
  if (claimed) {
    logger.info("cron_job_claimed", {
      jobId: claimed.id,
      route: claimed.taskPath,
      status: "running",
      provider: "cron",
      context: {
        scheduledToStartMs: Math.max(0, now.getTime() - claimed.scheduledFor.getTime()),
        attemptCount: claimed.attemptCount,
        maxAttempts: claimed.maxAttempts,
      },
    })
  }
  return claimed
}

export async function renewCronJobLease(
  job: Pick<ClaimedCronJob, "id" | "leaseToken">,
  now = new Date(),
  leaseMs = DEFAULT_LEASE_MS,
): Promise<boolean> {
  if (!Number.isInteger(leaseMs) || leaseMs < 30_000 || leaseMs > 600_000) {
    throw new Error("cron leaseMs must be an integer between 30000 and 600000")
  }
  const renewed = await db
    .update(cronJob)
    .set({
      leaseExpiresAt: new Date(now.getTime() + leaseMs),
      updatedAt: now,
    })
    .where(
      and(
        eq(cronJob.id, job.id),
        eq(cronJob.status, "running"),
        eq(cronJob.leaseToken, job.leaseToken),
      ),
    )
    .returning({ id: cronJob.id })
  return renewed.length === 1
}

export async function completeClaimedCronJob(
  job: ClaimedCronJob,
  result: { statusCode: number; durationMs: number; error?: unknown },
  now = new Date(),
): Promise<boolean> {
  const success = result.statusCode >= 200 && result.statusCode < 300
  const disposition = success
    ? "succeeded"
    : failedAttemptDisposition({
        retryPolicy: job.retryPolicy as CronRetryPolicy,
        idempotencyClass: job.idempotencyClass as CronIdempotencyClass,
        attemptCount: job.attemptCount,
        maxAttempts: job.maxAttempts,
        statusCode: result.statusCode,
      })
  const nextAvailableAt =
    disposition === "retry_wait" ? retryAvailableAt(job.attemptCount, now) : now
  const lastError = success
    ? null
    : sanitizeCronJobError(result.error ?? `cron route returned HTTP ${result.statusCode}`)

  return db.transaction(async (tx) => {
    const [completed] = await tx
      .update(cronJob)
      .set({
        status: disposition,
        availableAt: nextAvailableAt,
        leaseOwner: null,
        leaseToken: null,
        leaseExpiresAt: null,
        finishedAt: disposition === "retry_wait" ? null : now,
        statusCode: result.statusCode,
        durationMs: Math.max(0, Math.round(result.durationMs)),
        lastError,
        updatedAt: now,
      })
      .where(
        and(
          eq(cronJob.id, job.id),
          eq(cronJob.status, "running"),
          eq(cronJob.leaseToken, job.leaseToken),
        ),
      )
      .returning({ id: cronJob.id })
    if (!completed) return false

    await tx.insert(cronRunLog).values({
      // cron_run_log's compatibility semantics are actual attempt time.
      // scheduled_for remains available on cron_job for lag analysis.
      dispatchedAt: now,
      taskPath: job.taskPath,
      statusCode: result.statusCode,
      durationMs: Math.max(0, Math.round(result.durationMs)),
      error: lastError,
    })
    return true
  })
}

export async function recoverExpiredCronLeases(
  now = new Date(),
  allowedTaskPaths?: readonly string[],
): Promise<{
  recovered: number
  uncertain: number
  deadLettered: number
}> {
  const normalizedTaskPaths = normalizeCronTaskPathAllowlist(
    allowedTaskPaths,
    "cron lease recovery allowlist",
  )
  const result = await db.transaction(async (tx) => {
    const expired = await tx
      .select()
      .from(cronJob)
      .where(
        and(
          eq(cronJob.status, "running"),
          lte(cronJob.leaseExpiresAt, now),
          normalizedTaskPaths ? inArray(cronJob.taskPath, normalizedTaskPaths) : undefined,
        ),
      )
      .orderBy(asc(cronJob.leaseExpiresAt))
      .limit(EXPIRED_RECOVERY_BATCH)
      .for("update", { skipLocked: true })

    let recovered = 0
    let uncertain = 0
    let deadLettered = 0
    for (const job of expired) {
      const disposition = expiredLeaseDisposition({
        idempotencyClass: job.idempotencyClass as CronIdempotencyClass,
        attemptCount: job.attemptCount,
        maxAttempts: job.maxAttempts,
      })
      if (disposition === "retry_wait") recovered += 1
      else if (disposition === "uncertain") uncertain += 1
      else deadLettered += 1

      await tx
        .update(cronJob)
        .set({
          status: disposition,
          availableAt: now,
          leaseOwner: null,
          leaseToken: null,
          leaseExpiresAt: null,
          finishedAt: disposition === "retry_wait" ? null : now,
          lastError: sanitizeCronJobError(
            disposition === "uncertain"
              ? "Lease expired; external side effect completion is uncertain"
              : "Lease expired before the worker recorded completion",
          ),
          updatedAt: now,
        })
        .where(
          and(
            eq(cronJob.id, job.id),
            eq(cronJob.status, "running"),
            eq(cronJob.leaseToken, job.leaseToken!),
          ),
        )
    }
    return { recovered, uncertain, deadLettered }
  })
  if (result.recovered + result.uncertain + result.deadLettered > 0) {
    logger.warn("cron_lease_recovery", {
      status: result.uncertain + result.deadLettered > 0 ? "attention_required" : "recovered",
      provider: "cron",
      context: result,
    })
  }
  return result
}

export async function runOneCronLedgerJob(input: {
  apiKey: string
  baseUrl?: string
  workerId?: string
  allowedTaskPaths: readonly string[]
}): Promise<CronWorkerResult | null> {
  const baseUrl = resolveInternalCronBaseUrl(
    input.baseUrl ?? process.env.INTERNAL_BASE_URL,
    process.env.PORT ?? "3000",
  )
  const job = await claimCronJob({
    workerId: input.workerId,
    allowedTaskPaths: input.allowedTaskPaths,
  })
  if (!job) return null
  return executeClaimedCronLedgerJob(job, input.apiKey, baseUrl)
}

export async function runCronLedgerBatch(input: {
  apiKey: string
  baseUrl?: string
  workerId?: string
  maxJobs?: number
  allowedTaskPaths: readonly string[]
}): Promise<CronWorkerResult[]> {
  const baseUrl = resolveInternalCronBaseUrl(
    input.baseUrl ?? process.env.INTERNAL_BASE_URL,
    process.env.PORT ?? "3000",
  )
  const maxJobs =
    input.maxJobs ??
    boundedIntegerEnv(
      process.env.CRON_LEDGER_MAX_JOBS_PER_TICK,
      8,
      1,
      20,
      "CRON_LEDGER_MAX_JOBS_PER_TICK",
    )
  if (!Number.isInteger(maxJobs) || maxJobs < 1 || maxJobs > 20) {
    throw new Error("cron maxJobs must be an integer between 1 and 20")
  }

  const executions: Array<Promise<CronWorkerResult>> = []
  let claimError: unknown
  try {
    for (let index = 0; index < maxJobs; index += 1) {
      const job = await claimCronJob({
        workerId: input.workerId,
        allowedTaskPaths: input.allowedTaskPaths,
      })
      if (!job) break
      // Start execution immediately so a later claim failure cannot leave
      // already-claimed jobs idle until their leases expire.
      executions.push(executeClaimedCronLedgerJob(job, input.apiKey, baseUrl))
    }
  } catch (error) {
    claimError = error
  }
  const results = await Promise.all(executions)
  if (claimError) throw claimError
  return results
}

async function executeClaimedCronLedgerJob(
  job: ClaimedCronJob,
  apiKey: string,
  baseUrl: string,
): Promise<CronWorkerResult> {
  if (!isSafeCronTaskPath(job.taskPath)) {
    // This should also be impossible due to materializer and DB checks. Keep
    // the execution boundary fail-closed in case rows were modified manually.
    await completeClaimedCronJob(job, {
      statusCode: 400,
      durationMs: 0,
      error: "Unsafe cron task path rejected before fetch",
    })
    return {
      path: job.taskPath,
      statusCode: 400,
      durationMs: 0,
      jobId: job.id,
      scheduledFor: job.scheduledFor.toISOString(),
      error: "unsafe cron task path",
    }
  }

  const startedAt = Date.now()
  let leaseLost = false
  let renewalInFlight: Promise<void> = Promise.resolve()
  const renewal = setInterval(() => {
    renewalInFlight = renewalInFlight.then(async () => {
      try {
        if (!(await renewCronJobLease(job))) leaseLost = true
      } catch {
        leaseLost = true
      }
    })
  }, RENEW_INTERVAL_MS)
  renewal.unref?.()

  let statusCode = 0
  let error: unknown
  try {
    const deadline = Date.now() + TASK_TIMEOUT_MS
    const response = await fetchWithTimeout(
      `${baseUrl}${job.taskPath}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "X-AAT-Cron-Job-Id": job.id,
          "X-AAT-Cron-Scheduled-For": job.scheduledFor.toISOString(),
        },
      },
      TASK_TIMEOUT_MS,
      `cron ledger ${job.taskPath}`,
    )
    statusCode = response.status
    await withTimeout(
      response.text(),
      Math.max(1, deadline - Date.now()),
      `cron ledger body ${job.taskPath}`,
    ).catch(() => {})
  } catch (caught) {
    error = caught
  } finally {
    clearInterval(renewal)
    await renewalInFlight
  }

  const durationMs = Date.now() - startedAt
  const storedError = error ? sanitizeCronJobError(error) : undefined
  const completed =
    !leaseLost &&
    (await completeClaimedCronJob(job, {
      statusCode,
      durationMs,
      error: storedError,
    }).catch(() => false))
  if (!completed) {
    logger.error("cron_job_completion_lost", {
      jobId: job.id,
      route: job.taskPath,
      status: "lease_lost",
      durationMs,
      provider: "cron",
    })
    return {
      path: job.taskPath,
      statusCode: 0,
      durationMs,
      jobId: job.id,
      scheduledFor: job.scheduledFor.toISOString(),
      error: "lease lost before completion was recorded",
    }
  }

  const logFields = {
    jobId: job.id,
    route: job.taskPath,
    status: statusCode,
    durationMs,
    provider: "cron",
    context: {
      scheduledToStartMs: Math.max(0, startedAt - job.scheduledFor.getTime()),
      attemptCount: job.attemptCount,
    },
  }
  if (statusCode >= 200 && statusCode < 300) logger.info("cron_job_completed", logFields)
  else logger.warn("cron_job_completed", logFields)

  return {
    path: job.taskPath,
    statusCode,
    durationMs,
    jobId: job.id,
    scheduledFor: job.scheduledFor.toISOString(),
    ...(storedError ? { error: storedError } : {}),
  }
}

export async function cronLedgerBacklogSummary(now = new Date()): Promise<{
  pending: number
  running: number
  retryWait: number
  uncertain: number
  deadLettered: number
  oldestPendingSeconds: number | null
  materializationLagSeconds: number | null
  taskDurationP50Ms: number | null
  taskDurationP95Ms: number | null
  scheduledToStartP50Ms: number | null
  scheduledToStartP95Ms: number | null
}> {
  const result = await db.execute<{
    pending: number
    running: number
    retry_wait: number
    uncertain: number
    dead_lettered: number
    oldest_pending_seconds: number | null
    materialization_lag_seconds: number | null
    task_duration_p50_ms: number | null
    task_duration_p95_ms: number | null
    scheduled_to_start_p50_ms: number | null
    scheduled_to_start_p95_ms: number | null
  }>(sql`
    SELECT
      count(*) FILTER (WHERE status = 'pending')::int AS pending,
      count(*) FILTER (WHERE status = 'running')::int AS running,
      count(*) FILTER (WHERE status = 'retry_wait')::int AS retry_wait,
      count(*) FILTER (WHERE status = 'uncertain')::int AS uncertain,
      count(*) FILTER (WHERE status = 'dead_lettered')::int AS dead_lettered,
      extract(epoch FROM (${now}::timestamptz - min(scheduled_for)
        FILTER (WHERE status IN ('pending', 'retry_wait'))))::int AS oldest_pending_seconds,
      greatest(0, extract(epoch FROM (
        ${now}::timestamptz - (
          SELECT scanned_through
          FROM ${cronMaterializationCursor}
          WHERE id = ${CURSOR_ID}
        )
      )))::int AS materialization_lag_seconds,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY duration_ms)
        FILTER (WHERE finished_at >= ${new Date(now.getTime() - 86_400_000)}
          AND duration_ms IS NOT NULL)::int AS task_duration_p50_ms,
      percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms)
        FILTER (WHERE finished_at >= ${new Date(now.getTime() - 86_400_000)}
          AND duration_ms IS NOT NULL)::int AS task_duration_p95_ms,
      percentile_cont(0.5) WITHIN GROUP (
        ORDER BY greatest(0, extract(epoch FROM (started_at - scheduled_for)) * 1000)
      ) FILTER (WHERE started_at >= ${new Date(now.getTime() - 86_400_000)}
          AND started_at IS NOT NULL)::int AS scheduled_to_start_p50_ms,
      percentile_cont(0.95) WITHIN GROUP (
        ORDER BY greatest(0, extract(epoch FROM (started_at - scheduled_for)) * 1000)
      ) FILTER (WHERE started_at >= ${new Date(now.getTime() - 86_400_000)}
          AND started_at IS NOT NULL)::int AS scheduled_to_start_p95_ms
    FROM ${cronJob}
    WHERE execution_mode = 'ledger'
  `)
  const row = (result as unknown as { rows?: Array<Record<string, number | null>> }).rows?.[0]
  return {
    pending: Number(row?.pending ?? 0),
    running: Number(row?.running ?? 0),
    retryWait: Number(row?.retry_wait ?? 0),
    uncertain: Number(row?.uncertain ?? 0),
    deadLettered: Number(row?.dead_lettered ?? 0),
    oldestPendingSeconds:
      row?.oldest_pending_seconds === null || row?.oldest_pending_seconds === undefined
        ? null
        : Number(row.oldest_pending_seconds),
    materializationLagSeconds: nullableNumber(row?.materialization_lag_seconds),
    taskDurationP50Ms: nullableNumber(row?.task_duration_p50_ms),
    taskDurationP95Ms: nullableNumber(row?.task_duration_p95_ms),
    scheduledToStartP50Ms: nullableNumber(row?.scheduled_to_start_p50_ms),
    scheduledToStartP95Ms: nullableNumber(row?.scheduled_to_start_p95_ms),
  }
}

function nullableNumber(value: number | null | undefined): number | null {
  return value === null || value === undefined ? null : Number(value)
}

function boundedIntegerEnv(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  name: string,
): number {
  if (!value) return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`)
  }
  return parsed
}

function sanitizeWorkerId(value: string): string {
  const sanitized = value.replace(/[^a-zA-Z0-9:._-]/g, "_").slice(0, 100)
  if (!sanitized) throw new Error("cron worker id is empty after sanitization")
  return sanitized
}
