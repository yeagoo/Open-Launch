import { NextRequest, NextResponse } from "next/server"

import { db } from "@/drizzle/db"
import { cronRunLog, cronSchedule } from "@/drizzle/db/schema"

import { verifyCronAuth } from "@/lib/cron-auth"
import { cronMatches } from "@/lib/cron-match"
import { cronStatusFromResult } from "@/lib/cron-status"
import { fetchWithTimeout, withTimeout } from "@/lib/fetch-timeout"
import { clearDedupe, dedupeOnce } from "@/lib/rate-limit"

export const dynamic = "force-dynamic"
// 5 min total cap. We give each fan-out 4 min and reserve 1 min for the
// dispatcher's own setup + log writes. Zeabur's default function timeout
// is 300s, so this stays inside it.
export const maxDuration = 300

const SUBTASK_TIMEOUT_MS = 240_000 // 4 min per fan-out

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
 *   - 500 if at least one was due AND none succeeded (cron-job.org alerts)
 *   - 200 with a `failed` count > 0 for partial failures (no alert spam)
 */
export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request)
  if (authError) return authError

  const apiKey = process.env.CRON_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: "CRON_API_KEY not configured" }, { status: 500 })
  }
  const authHeader = `Bearer ${apiKey}`
  // Self-fetch over loopback. The public origin (request.url) routes back
  // through Zeabur's ingress and times out (ETIMEDOUT) — the container
  // can't reach its own external hostname. INTERNAL_BASE_URL lets ops
  // override if needed; otherwise hit 127.0.0.1 on the same port.
  const baseUrl = process.env.INTERNAL_BASE_URL ?? `http://127.0.0.1:${process.env.PORT ?? "3000"}`
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
        console.error("cron_run_log insert failed:", err)
      }
    }

    const successCount = results.filter((r) => r.statusCode >= 200 && r.statusCode < 300).length
    const failedCount = results.length - successCount
    const status = cronStatusFromResult({
      errorCount: failedCount,
      successCount: successCount,
    })

    // Failed dispatch (some tasks were due and none succeeded → 500):
    // release the lease so cron-job.org's retry isn't skipped.
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
    if (heartbeatUrl && status < 500) {
      try {
        const heartbeat = await fetchWithTimeout(
          heartbeatUrl,
          { method: "GET" },
          5_000,
          "cron heartbeat",
        )
        await withTimeout(heartbeat.text(), 5_000, "cron heartbeat body").catch(() => {})
      } catch (err) {
        console.error("cron heartbeat ping failed:", err)
      }
    }

    return NextResponse.json(
      {
        dispatchedAt: now.toISOString(),
        ranCount: results.length,
        successCount,
        failedCount,
        skippedDisabled,
        results,
      },
      { status },
    )
  } catch (err) {
    // Unexpected failure (e.g. schedule DB read threw): release the lease
    // so the retry can run, then surface a 500 for cron-job.org to retry.
    await clearDedupe(dedupeKey)
    console.error("cron dispatch failed:", err)
    return NextResponse.json({ error: "dispatch failed" }, { status: 500 })
  }
}
