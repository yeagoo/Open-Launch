import { previousFireTime } from "./cron-match"

// High-frequency tasks get a minimum window so one missed tick is not enough
// to alert. The boundary tolerance also keeps a just-started schedule window
// out of the completed-window calculation: cron-health can run concurrently
// with a long task before that task's successful row has been persisted.
export const CRON_HEALTH_MIN_GRACE_MS = 20 * 60 * 1000
export const CRON_HEALTH_SCHEDULE_BOUNDARY_TOLERANCE_MS = 2 * 60 * 1000

export type CronTaskStaleness = {
  isStale: boolean
  quietForMs: number
  graceMs: number
  alertThresholdMs: number
}

/**
 * Evaluate one task against completed schedule windows.
 *
 * Staleness is judged against the second-most-recent scheduled fire so a
 * single missed run does not alert. A small boundary tolerance prevents a
 * concurrent task and cron-health task in the same dispatcher batch from
 * turning sub-minute persistence timing into a false positive.
 */
export function evaluateCronTaskStaleness({
  cronExpression,
  now,
  secondsSinceLastSuccess,
  secondsSinceCreated,
}: {
  cronExpression: string
  now: Date
  secondsSinceLastSuccess: number | undefined
  secondsSinceCreated: number
}): CronTaskStaleness | null {
  // Evaluate completed schedule windows just behind the live clock. Merely
  // adding tolerance to the final age threshold is insufficient at a
  // low-frequency boundary: the second-previous fire can jump forward by a
  // day/week the instant a new window starts, making a concurrent task appear
  // stale before it has had time to finish.
  const scheduleReference = new Date(now.getTime() - CRON_HEALTH_SCHEDULE_BOUNDARY_TOLERANCE_MS)
  const previousFire = previousFireTime(cronExpression, scheduleReference)
  if (!previousFire) return null

  const secondPreviousFire = previousFireTime(cronExpression, new Date(previousFire.getTime() - 1))
  const graceMs = secondPreviousFire
    ? Math.max(CRON_HEALTH_MIN_GRACE_MS, now.getTime() - secondPreviousFire.getTime())
    : CRON_HEALTH_MIN_GRACE_MS
  const alertThresholdMs = graceMs + CRON_HEALTH_SCHEDULE_BOUNDARY_TOLERANCE_MS
  const quietForMs =
    secondsSinceLastSuccess === undefined
      ? Number.POSITIVE_INFINITY
      : secondsSinceLastSuccess * 1000

  if (quietForMs <= alertThresholdMs) {
    return { isStale: false, quietForMs, graceMs, alertThresholdMs }
  }

  // A newly registered low-frequency task is not broken before it has had a
  // completed opportunity to run. Tasks with a past success do not use this
  // registration-age exception.
  if (secondsSinceLastSuccess === undefined && secondsSinceCreated * 1000 <= alertThresholdMs) {
    return { isStale: false, quietForMs, graceMs, alertThresholdMs }
  }

  return { isStale: true, quietForMs, graceMs, alertThresholdMs }
}
