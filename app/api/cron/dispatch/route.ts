import { NextRequest, NextResponse } from "next/server"

import { db } from "@/drizzle/db"
import { cronRunLog, cronSchedule } from "@/drizzle/db/schema"

import { verifyCronAuth } from "@/lib/cron-auth"
import { cronMatches } from "@/lib/cron-match"
import { cronStatusFromResult } from "@/lib/cron-status"

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
    const res = await fetch(`${baseUrl}${path}`, {
      headers: { Authorization: authHeader },
      signal: AbortSignal.timeout(SUBTASK_TIMEOUT_MS),
    })
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
}
