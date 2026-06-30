import { NextRequest, NextResponse } from "next/server"

import { db } from "@/drizzle/db"
import { cronRunLog, cronSchedule } from "@/drizzle/db/schema"
import { and, gte, sql } from "drizzle-orm"

import { verifyCronAuth } from "@/lib/cron-auth"
import { previousFireTime } from "@/lib/cron-match"
import { sendAdminPaymentNotification } from "@/lib/transactional-emails"

/**
 * Cron self-monitor.
 *
 * Background: on 2026-06-26 the external every-minute trigger that calls
 * `/api/cron/dispatch` silently stopped. The whole scheduler was dead for
 * ~2.5 days — `update-launches` never ran, so the homepage's daily rankings
 * went empty — and nobody noticed until a human spotted the empty feed.
 *
 * This cron catches the "a task quietly stopped running" class of failure:
 *   1. For each ENABLED task, compute when it should have last fired (from its
 *      own cron expression) and compare against the last successful row in
 *      cron_run_log. If the gap exceeds STALE_FACTOR× the task's interval, it's
 *      stale → alert.
 *   2. If cron_run_log has had NO rows at all in the recent window, the whole
 *      dispatcher is down → alert (the loud, this-time case).
 *
 * Limitation by design: this cron is itself dispatched by the same scheduler,
 * so if the dispatcher dies entirely THIS won't run either. That blind spot is
 * covered separately by the external dead-man heartbeat in the dispatcher
 * (CRON_HEARTBEAT_URL) — an outside service alerts when the ping stops. The two
 * are complementary: heartbeat catches total death, this catches single-task
 * drift while the dispatcher is otherwise alive.
 *
 * Auth: standard CRON_API_KEY bearer. Registered in cron_schedule by the
 * accompanying migration (every 30 min).
 */
export const dynamic = "force-dynamic"
export const maxDuration = 30

// Floor on the tolerated gap so high-frequency jobs (every 1–5 min) don't
// alert on a single hiccup. A run is only "missed" if it's been quiet longer
// than this AND past its second-most-recent scheduled fire (see the loop).
const MIN_GRACE_MS = 20 * 60 * 1000 // 20 min
// Total-silence detector: if the entire cron_run_log has no rows newer than
// this, the dispatcher itself is almost certainly down.
const DISPATCHER_SILENCE_MS = 30 * 60 * 1000 // 30 min

interface StaleTask {
  path: string
  displayName: string
  expression: string
  quietForMs: number
}

export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request)
  if (authError) return authError

  try {
    const now = new Date()

    const tasks = await db
      .select({
        path: cronSchedule.path,
        displayName: cronSchedule.displayName,
        cronExpression: cronSchedule.cronExpression,
        enabled: cronSchedule.enabled,
        // DB-side age of the registration row, same reasoning as the run-gap
        // query below (avoid process↔DB tz skew on a no-tz timestamp).
        secondsSinceCreated: sql<number>`extract(epoch from (now() - ${cronSchedule.createdAt}))`,
      })
      .from(cronSchedule)

    const enabled = tasks.filter((t) => t.enabled && t.path !== "/api/cron/cron-health")

    // Seconds since each task's last SUCCESSFUL (2xx) run, computed entirely
    // DB-side via `now() - max(dispatched_at)`. cron_run_log.dispatched_at is a
    // `timestamp` (no tz); mixing a JS Date.now() with a driver-parsed value
    // skews by the process↔DB timezone offset. Doing the subtraction in SQL
    // keeps both operands on the DB clock, so the gap is correct regardless of
    // where this runs. A task that 500s every tick never appears here → treated
    // as never-succeeded, which is correct (as broken as one that never runs).
    //
    // No recency cutoff on the scan: some tasks tolerate gaps longer than a
    // week (db-backup ~9d grace, the monthly blog recap ~90d), so filtering to
    // a fixed window would drop a still-valid last-success row and falsely
    // flag the task stale. cron_run_log is retention-trimmed to 90d, so this
    // grouped max() seq-scans ~100k rows at most — a few ms, and it only runs
    // every 30 min, so the full scan is fine.
    const lastRuns = await db
      .select({
        taskPath: cronRunLog.taskPath,
        secondsSince: sql<number>`extract(epoch from (now() - max(${cronRunLog.dispatchedAt})))`,
      })
      .from(cronRunLog)
      .where(and(gte(cronRunLog.statusCode, 200), sql`${cronRunLog.statusCode} < 300`))
      .groupBy(cronRunLog.taskPath)
    const secsSinceByPath = new Map(lastRuns.map((r) => [r.taskPath, Number(r.secondsSince)]))

    // Total-silence check: seconds since the newest row across the whole log,
    // again DB-side. null (empty table) ⇒ silent.
    const [newest] = await db
      .select({
        secondsSince: sql<
          number | null
        >`extract(epoch from (now() - max(${cronRunLog.dispatchedAt})))`,
      })
      .from(cronRunLog)
    const dispatcherSilentSecs = newest?.secondsSince == null ? null : Number(newest.secondsSince)
    const dispatcherSilent =
      dispatcherSilentSecs === null || dispatcherSilentSecs * 1000 > DISPATCHER_SILENCE_MS

    const stale: StaleTask[] = []
    for (const t of enabled) {
      // Staleness is judged against the SECOND-most-recent scheduled fire, not a
      // synthetic uniform interval. A task is stale only if it hasn't succeeded
      // since `prevPrev` — which means it missed its most recent fire (`prev`)
      // by a full additional gap. Using prevPrev directly (rather than
      // prev−prevPrev × factor) makes irregular schedules correct for free:
      // the DeepSeek off-peak crons pause for hours (e.g. `*/5 0,4,5,10-23`
      // skips 01:00–04:00), and moderate-tags has a 12h overnight gap. The gap
      // back to prevPrev already encodes those planned pauses, so the monitor
      // won't false-alert during them while still catching a genuinely stuck job
      // one full interval after its last expected run.
      const prev = previousFireTime(t.cronExpression, now)
      if (!prev) continue // unparseable expression — skip, not our alarm to raise
      const prevPrev = previousFireTime(t.cronExpression, new Date(prev.getTime() - 1))
      const graceMs = prevPrev
        ? Math.max(MIN_GRACE_MS, now.getTime() - prevPrev.getTime())
        : MIN_GRACE_MS

      // null ⇒ no successful run on record (within the 90d retention) ⇒
      // effectively infinite gap.
      const secsSince = secsSinceByPath.get(t.path)
      const quietForMs = secsSince == null ? Number.POSITIVE_INFINITY : secsSince * 1000
      if (quietForMs <= graceMs) continue

      // Suppress the false positive for a task that has simply never come due
      // yet: a freshly registered low-frequency job (weekly roundup, monthly
      // recap) has no run row but isn't broken. Only treat "never succeeded" as
      // stale once the task has been registered longer than one grace window —
      // i.e. it has actually had a chance to fire and didn't. Tasks WITH a past
      // success always fall through to the staleness alert regardless of age.
      if (secsSince == null && t.secondsSinceCreated * 1000 <= graceMs) continue

      stale.push({
        path: t.path,
        displayName: t.displayName,
        expression: t.cronExpression,
        quietForMs,
      })
    }

    if (!dispatcherSilent && stale.length === 0) {
      return NextResponse.json({ status: "healthy", checked: enabled.length })
    }

    // Build the alert. Dispatcher-down is the headline when detected; otherwise
    // it's the per-task stale list.
    const lines: string[] = []
    if (dispatcherSilent) {
      lines.push(
        `CRON DISPATCHER APPEARS DOWN: no cron_run_log rows in the last ${Math.round(
          DISPATCHER_SILENCE_MS / 60000,
        )} min.`,
        dispatcherSilentSecs === null
          ? `cron_run_log is empty.`
          : `Last recorded run: ${Math.round(dispatcherSilentSecs / 60)} min ago.`,
        `Check the external every-minute trigger that calls /api/cron/dispatch (cron-job.org).`,
        ``,
      )
    }
    if (stale.length > 0) {
      lines.push(`${stale.length} cron task(s) are stale (no successful run within tolerance):`)
      for (const s of stale.slice(0, 20)) {
        const quiet = Number.isFinite(s.quietForMs)
          ? `${Math.round(s.quietForMs / 60000)} min`
          : "never (no run on record)"
        lines.push(`  - ${s.displayName} (${s.path}) [${s.expression}] — quiet ${quiet}`)
      }
    }
    const body = lines.join("\n")

    try {
      await sendAdminPaymentNotification({
        userEmail: "cron-health-monitor",
        amount: 0,
        currency: "usd",
        projectName: dispatcherSilent
          ? `CRON HEALTH alert: dispatcher down (no runs in ${Math.round(
              DISPATCHER_SILENCE_MS / 60000,
            )} min)`
          : `CRON HEALTH alert: ${stale.length} stale task(s)`,
        websiteUrl: body,
        orphan: true,
      })
    } catch (err) {
      console.error("⚠️ Failed to send cron-health alert email:", err)
    }

    return NextResponse.json({
      status: dispatcherSilent ? "dispatcher_down" : "degraded",
      checked: enabled.length,
      dispatcherSilent,
      staleCount: stale.length,
      stale: stale.slice(0, 20),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("❌ cron-health cron failed:", message)
    return NextResponse.json({ error: "cron-health failed", details: message }, { status: 500 })
  }
}
