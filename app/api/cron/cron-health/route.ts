import { NextRequest, NextResponse } from "next/server"

import { db } from "@/drizzle/db"
import { cronRunLog, cronSchedule } from "@/drizzle/db/schema"
import { and, gte, sql } from "drizzle-orm"

import { verifyCronAuth } from "@/lib/cron-auth"
import {
  CRON_HEALTH_ALERT_REMINDER_SECONDS,
  CRON_HEALTH_ALERT_STATE_KEY,
  cronHealthAlertFingerprint,
  cronHealthAlertIncidentAnchor,
} from "@/lib/cron-health-alert"
import { evaluateCronTaskStaleness } from "@/lib/cron-health-staleness"
import { clearStatefulAlert, decideStatefulAlert, releaseStatefulAlert } from "@/lib/rate-limit"
import { sendAdminOperationalAlert } from "@/lib/transactional-emails"

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

// Total-silence detector: if the entire cron_run_log has no rows newer than
// this, the dispatcher itself is almost certainly down.
const DISPATCHER_SILENCE_MS = 30 * 60 * 1000 // 30 min

interface StaleTask {
  path: string
  displayName: string
  expression: string
  quietForMs: number
  lastSuccessEpochSeconds: string | null
  scheduleUpdatedEpochSeconds: string
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
        scheduleUpdatedEpochSeconds: sql<string>`floor(extract(epoch from ${cronSchedule.updatedAt}))::text`,
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
        lastSuccessEpochSeconds: sql<string>`floor(extract(epoch from max(${cronRunLog.dispatchedAt})))::text`,
      })
      .from(cronRunLog)
      .where(and(gte(cronRunLog.statusCode, 200), sql`${cronRunLog.statusCode} < 300`))
      .groupBy(cronRunLog.taskPath)
    const secsSinceByPath = new Map(lastRuns.map((r) => [r.taskPath, Number(r.secondsSince)]))
    const lastSuccessEpochByPath = new Map(
      lastRuns.map((r) => [r.taskPath, r.lastSuccessEpochSeconds]),
    )

    // Total-silence check: seconds since the newest row across the whole log,
    // again DB-side. null (empty table) ⇒ silent.
    const [newest] = await db
      .select({
        secondsSince: sql<
          number | null
        >`extract(epoch from (now() - max(${cronRunLog.dispatchedAt})))`,
        lastRunEpochSeconds: sql<
          string | null
        >`floor(extract(epoch from max(${cronRunLog.dispatchedAt})))::text`,
      })
      .from(cronRunLog)
    const dispatcherSilentSecs = newest?.secondsSince == null ? null : Number(newest.secondsSince)
    const dispatcherSilent =
      dispatcherSilentSecs === null || dispatcherSilentSecs * 1000 > DISPATCHER_SILENCE_MS

    const stale: StaleTask[] = []
    for (const t of enabled) {
      const secsSince = secsSinceByPath.get(t.path)
      const staleness = evaluateCronTaskStaleness({
        cronExpression: t.cronExpression,
        now,
        secondsSinceLastSuccess: secsSince,
        secondsSinceCreated: Number(t.secondsSinceCreated),
      })
      if (!staleness?.isStale) continue

      stale.push({
        path: t.path,
        displayName: t.displayName,
        expression: t.cronExpression,
        quietForMs: staleness.quietForMs,
        lastSuccessEpochSeconds: lastSuccessEpochByPath.get(t.path) ?? null,
        scheduleUpdatedEpochSeconds: t.scheduleUpdatedEpochSeconds,
      })
    }

    if (!dispatcherSilent && stale.length === 0) {
      const alertStateCleared = await clearStatefulAlert(CRON_HEALTH_ALERT_STATE_KEY)
      return NextResponse.json({ status: "healthy", checked: enabled.length, alertStateCleared })
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

    const alertFingerprint = cronHealthAlertFingerprint(
      dispatcherSilent,
      stale.map((task) => task.path),
    )
    const alertIncidentAnchor = cronHealthAlertIncidentAnchor(
      dispatcherSilent,
      newest?.lastRunEpochSeconds ?? null,
      stale.map((task) => ({
        path: task.path,
        lastSuccessEpochSeconds: task.lastSuccessEpochSeconds,
        scheduleUpdatedEpochSeconds: task.scheduleUpdatedEpochSeconds,
      })),
    )
    const alertDecision = await decideStatefulAlert(
      CRON_HEALTH_ALERT_STATE_KEY,
      alertFingerprint,
      alertIncidentAnchor,
      CRON_HEALTH_ALERT_REMINDER_SECONDS,
    )
    let alertNotification: "sent" | "suppressed" | "failed" = "suppressed"
    let alertStateReleased: boolean | null = null
    if (alertDecision.shouldSend) {
      try {
        await sendAdminOperationalAlert({
          monitor: "cron-health",
          title: dispatcherSilent
            ? `CRON HEALTH alert: dispatcher down (no runs in ${Math.round(
                DISPATCHER_SILENCE_MS / 60000,
              )} min)`
            : `CRON HEALTH alert: ${stale.length} stale task(s)`,
          details: body,
        })
        alertNotification = "sent"
      } catch (err) {
        alertNotification = "failed"
        alertStateReleased = await releaseStatefulAlert(
          CRON_HEALTH_ALERT_STATE_KEY,
          alertFingerprint,
          alertIncidentAnchor,
        )
        console.error("⚠️ Failed to send cron-health alert email:", err)
      }
    }

    return NextResponse.json({
      status: dispatcherSilent ? "dispatcher_down" : "degraded",
      checked: enabled.length,
      dispatcherSilent,
      staleCount: stale.length,
      stale: stale.slice(0, 20),
      alertNotification,
      alertReason: alertDecision.reason,
      alertStateReleased,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("❌ cron-health cron failed:", message)
    return NextResponse.json({ error: "cron-health failed", details: message }, { status: 500 })
  }
}
