import { NextRequest, NextResponse } from "next/server"

import { db } from "@/drizzle/db"
import { cronRunLog, cronSchedule } from "@/drizzle/db/schema"

import { verifyCronAuth } from "@/lib/cron-auth"
import { cronTaskAuthority, resolveCronRuntimeAuthority } from "@/lib/cron-cutover"
import {
  pingCronHeartbeat,
  type CronHeartbeatResult,
  type CronHeartbeatState,
} from "@/lib/cron-heartbeat"
import {
  parseBooleanEnv,
  resolveInternalCronBaseUrl,
  sanitizeCronJobError,
} from "@/lib/cron-ledger-core"
import {
  cronLedgerBacklogSummary,
  materializeCronLedger,
  runCronLedgerBatch,
  type CronMaterializationResult,
} from "@/lib/cron-ledger-db"
import { cronMatches } from "@/lib/cron-match"
import { cronDispatcherStatusFromResult } from "@/lib/cron-status"
import { fetchWithTimeout, withTimeout } from "@/lib/fetch-timeout"
import { logger } from "@/lib/observability/structured-logger"
import { clearDedupe, dedupeOnce } from "@/lib/rate-limit"

export const dynamic = "force-dynamic"
// 5 min total cap. We give each fan-out 4 min and reserve 1 min for the
// dispatcher's own setup + log writes. Keep the route and reverse-proxy
// timeout at or above this value in the self-hosted deployment.
export const maxDuration = 300

const SUBTASK_TIMEOUT_MS = 240_000 // 4 min per fan-out

const globalForHeartbeat = globalThis as typeof globalThis & {
  __aatCronHeartbeatState?: CronHeartbeatState
}
const heartbeatState = (globalForHeartbeat.__aatCronHeartbeatState ??= {
  consecutiveFailures: 0,
  nextAttemptAt: 0,
})

interface TaskResult {
  path: string
  statusCode: number
  durationMs: number
  error?: string
}

async function runTask(baseUrl: string, authHeader: string, path: string): Promise<TaskResult> {
  const start = Date.now()
  try {
    // Non-aborting timeout: an AbortSignal firing mid-stream corrupts undici's
    // web-streams pool (see lib/fetch-timeout.ts). We only need the status, but
    // the body is then consumed so undici can recycle the loopback connection.
    const deadline = Date.now() + SUBTASK_TIMEOUT_MS
    const res = await fetchWithTimeout(
      `${baseUrl}${path}`,
      { headers: { Authorization: authHeader } },
      SUBTASK_TIMEOUT_MS,
      `dispatch ${path}`,
    )
    await withTimeout(res.text(), Math.max(1, deadline - Date.now()), `dispatch ${path}`).catch(
      () => {},
    )
    return { path, statusCode: res.status, durationMs: Date.now() - start }
  } catch (err) {
    return {
      path,
      statusCode: 0,
      durationMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

/**
 * Single entrypoint cron-job.org calls every minute. Reads the schedule
 * from cron_schedule, fires every task whose expression matches the
 * current minute, writes one cron_run_log row per attempted task.
 *
 * Status code:
 *   - 200 if all due tasks succeeded OR no tasks were due
 *   - 500 if any due task failed, making the minute retryable
 */
export async function GET(request: NextRequest) {
  const startedAt = Date.now()
  const requestId = request.headers.get("x-aat-request-id")
  const authError = verifyCronAuth(request)
  if (authError) return authError

  const apiKey = process.env.CRON_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: "CRON_API_KEY not configured" }, { status: 500 })
  }
  const authHeader = `Bearer ${apiKey}`
  // Self-fetch over loopback instead of making the host route its own public
  // origin through Cloudflare/reverse-proxy ingress. INTERNAL_BASE_URL lets
  // ops override if needed; otherwise hit 127.0.0.1 on the same port.
  const baseUrl = resolveInternalCronBaseUrl(
    process.env.INTERNAL_BASE_URL,
    process.env.PORT ?? "3000",
  )
  const now = new Date()

  // Concurrency guard: cron-job.org can fire twice in a minute (retry,
  // or an overlapping manual trigger), which would run every due task
  // concurrently. Claim a per-minute lease (Redis SET NX, cross-instance)
  // so only the first dispatch in a given minute fans out. 90s TTL > the
  // 1-minute tick so the lease covers the whole window.
  //
  // IMPORTANT: the lease is RELEASED if this dispatch fails (a 500 status
  // or a thrown error) — see the catch/failure paths below. Otherwise a
  // failed run would hold the lease and cron-job.org's same-minute retry
  // would be skipped, killing the only auto-retry for once-daily jobs
  // (launch updates, ProductHunt import). A successful run keeps the lease
  // so genuine duplicate fires in the same minute stay suppressed.
  const minuteBucket = now.toISOString().slice(0, 16) // YYYY-MM-DDTHH:MM
  const dedupeKey = `cron-dispatch:${minuteBucket}`
  const claimed = await dedupeOnce(dedupeKey, 90)
  if (!claimed) {
    return NextResponse.json(
      { skipped: true, reason: "dispatch already ran this minute", minuteBucket },
      { status: 200 },
    )
  }

  try {
    const authority = resolveCronRuntimeAuthority(process.env)
    const schedulerMode = authority.mode
    let materialization: CronMaterializationResult | { mode: "shadow"; error: string } | undefined
    let ledgerResults: Awaited<ReturnType<typeof runCronLedgerBatch>> = []
    let workerMode: "embedded" | "external" | undefined

    if (schedulerMode === "shadow") {
      try {
        materialization = await materializeCronLedger("shadow", now)
      } catch (error) {
        // Shadow must never interrupt the legacy authority. Surface the
        // failure in both logs and the response so comparison cannot silently
        // appear healthy.
        const message = sanitizeCronJobError(error)
        logger.warn("cron_shadow_materialization_failed", {
          requestId,
          route: "/api/cron/dispatch",
          status: "failed",
          durationMs: Date.now() - startedAt,
          provider: "cron",
          context: { message },
          error,
        })
        materialization = { mode: "shadow", error: message }
      }
    } else if (schedulerMode === "canary") {
      materialization = await materializeCronLedger("ledger", now, {
        allowedTaskPaths: authority.ledgerTaskPaths,
      })
      const embeddedWorker = parseBooleanEnv(
        process.env.CRON_LEDGER_EMBEDDED_WORKER,
        true,
        "CRON_LEDGER_EMBEDDED_WORKER",
      )
      workerMode = embeddedWorker ? "embedded" : "external"
      ledgerResults = embeddedWorker
        ? await runCronLedgerBatch({
            apiKey,
            baseUrl,
            allowedTaskPaths: authority.ledgerTaskPaths,
          })
        : []
    } else if (schedulerMode === "ledger") {
      materialization = await materializeCronLedger("ledger", now)
      const embeddedWorker = parseBooleanEnv(
        process.env.CRON_LEDGER_EMBEDDED_WORKER,
        true,
        "CRON_LEDGER_EMBEDDED_WORKER",
      )
      const workerResults = embeddedWorker
        ? await runCronLedgerBatch({
            apiKey,
            baseUrl,
            allowedTaskPaths: authority.ledgerTaskPaths,
          })
        : []
      const results: TaskResult[] = workerResults.map((result) => ({
        path: result.path,
        statusCode: result.statusCode,
        durationMs: result.durationMs,
        error: result.error,
      }))
      const successCount = results.filter(
        (result) => result.statusCode >= 200 && result.statusCode < 300,
      ).length
      const failedCount = results.length - successCount
      const status = cronDispatcherStatusFromResult({
        errorCount: failedCount,
        successCount,
      })
      if (status >= 500) await clearDedupe(dedupeKey)

      const heartbeatUrl = process.env.CRON_HEARTBEAT_URL
      let heartbeat: CronHeartbeatResult | { status: "disabled" } = { status: "disabled" }
      if (heartbeatUrl && status < 500) {
        heartbeat = await pingCronHeartbeat(heartbeatUrl, heartbeatState)
      }
      const backlog = await cronLedgerBacklogSummary(now)
      const logFields = {
        requestId,
        route: "/api/cron/dispatch",
        status,
        durationMs: Date.now() - startedAt,
        provider: "cron",
        context: {
          schedulerMode,
          workerMode: embeddedWorker ? "embedded" : "external",
          ranCount: results.length,
          successCount,
          failedCount,
          materialization,
          backlog,
        },
      }
      if (status >= 500) logger.warn("cron_dispatch_completed", logFields)
      else logger.info("cron_dispatch_completed", logFields)

      return NextResponse.json(
        {
          schedulerMode,
          workerMode: embeddedWorker ? "embedded" : "external",
          dispatchedAt: now.toISOString(),
          ranCount: results.length,
          successCount,
          failedCount,
          materialization,
          backlog,
          heartbeat,
          results: workerResults,
        },
        { status },
      )
    }

    const allTasks = await db
      .select({
        path: cronSchedule.path,
        cronExpression: cronSchedule.cronExpression,
        enabled: cronSchedule.enabled,
      })
      .from(cronSchedule)

    const due: typeof allTasks = []
    const skippedDisabled: string[] = []
    for (const t of allTasks) {
      if (cronTaskAuthority(t.path, authority) === "ledger") continue
      if (!t.enabled) {
        // We still note disabled tasks in the response, but don't fire them
        // and don't write a log row (no work happened, no signal to record).
        if (cronMatches(t.cronExpression, now)) skippedDisabled.push(t.path)
        continue
      }
      if (cronMatches(t.cronExpression, now)) due.push(t)
    }

    const results = await Promise.all(due.map((t) => runTask(baseUrl, authHeader, t.path)))

    // Persist run log. One row per attempted task. Done after fan-out so a
    // slow log write doesn't delay the actual work.
    if (results.length > 0) {
      try {
        await db.insert(cronRunLog).values(
          results.map((r) => ({
            dispatchedAt: now,
            taskPath: r.path,
            statusCode: r.statusCode,
            durationMs: r.durationMs,
            error: r.error,
          })),
        )
      } catch (err) {
        logger.error("cron_run_log_insert_failed", {
          requestId,
          route: "/api/cron/dispatch",
          status: "failed",
          durationMs: Date.now() - startedAt,
          provider: "postgres",
          error: err,
        })
      }
    }

    const combinedResults: TaskResult[] = [
      ...results,
      ...ledgerResults.map((result) => ({
        path: result.path,
        statusCode: result.statusCode,
        durationMs: result.durationMs,
        error: result.error,
      })),
    ]
    const successCount = combinedResults.filter(
      (result) => result.statusCode >= 200 && result.statusCode < 300,
    ).length
    const failedCount = combinedResults.length - successCount
    const status = cronDispatcherStatusFromResult({
      errorCount: failedCount,
      successCount: successCount,
    })

    // Any failed subtask makes the dispatch retryable. Release the lease so
    // cron-job.org's same-minute retry isn't suppressed by a successful sibling.
    if (status >= 500) {
      await clearDedupe(dedupeKey)
    }

    // External dead-man heartbeat. Ping a healthcheck URL (healthchecks.io,
    // Better Stack, etc.) on every successful dispatch. If the whole scheduler
    // dies — the exact 2026-06-26 outage where the every-minute trigger stopped
    // for 2.5 days — these pings stop and the external service alerts. This is
    // the one failure the in-app cron-health monitor structurally CANNOT catch
    // (it's dispatched by the same dead scheduler). Fire-and-forget and fully
    // optional: a missing/broken URL never affects dispatch. Skipped on a 500
    // dispatch so we don't signal "healthy" when nothing succeeded.
    const heartbeatUrl = process.env.CRON_HEARTBEAT_URL
    let heartbeat: CronHeartbeatResult | { status: "disabled" } = { status: "disabled" }
    if (heartbeatUrl && status < 500) {
      heartbeat = await pingCronHeartbeat(heartbeatUrl, heartbeatState)
    }
    const logFields = {
      requestId,
      route: "/api/cron/dispatch",
      status,
      durationMs: Date.now() - startedAt,
      provider: "cron",
      context: {
        schedulerMode,
        workerMode,
        canaryTaskPath: authority.canaryTaskPath,
        ranCount: combinedResults.length,
        legacyRanCount: results.length,
        ledgerRanCount: ledgerResults.length,
        successCount,
        failedCount,
        skippedDisabledCount: skippedDisabled.length,
        materialization,
      },
    }
    if (status >= 500) logger.warn("cron_dispatch_completed", logFields)
    else logger.info("cron_dispatch_completed", logFields)

    const backlog = schedulerMode === "canary" ? await cronLedgerBacklogSummary(now) : undefined
    return NextResponse.json(
      {
        schedulerMode,
        ...(workerMode ? { workerMode } : {}),
        ...(authority.canaryTaskPath ? { canaryTaskPath: authority.canaryTaskPath } : {}),
        dispatchedAt: now.toISOString(),
        ranCount: combinedResults.length,
        legacyRanCount: results.length,
        ledgerRanCount: ledgerResults.length,
        successCount,
        failedCount,
        skippedDisabled,
        materialization,
        ...(backlog ? { backlog } : {}),
        heartbeat,
        results: combinedResults,
      },
      { status },
    )
  } catch (err) {
    // Unexpected failure (e.g. schedule DB read threw): release the lease
    // so the retry can run, then surface a 500 for cron-job.org to retry.
    await clearDedupe(dedupeKey)
    logger.error("cron_dispatch_failed", {
      requestId,
      route: "/api/cron/dispatch",
      status: 500,
      durationMs: Date.now() - startedAt,
      provider: "cron",
      error: err,
    })
    return NextResponse.json({ error: "dispatch failed" }, { status: 500 })
  }
}
