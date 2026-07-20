import { createHash } from "node:crypto"

export const CRON_HEALTH_ALERT_STATE_KEY = "cron-health"
export const CRON_HEALTH_ALERT_REMINDER_SECONDS = 12 * 60 * 60

export type CronHealthIncidentTask = {
  path: string
  lastSuccessEpochSeconds: string | null
  scheduleUpdatedEpochSeconds: string
}

/**
 * Stable fingerprint for the active cron-health failure set. Relative ages
 * are intentionally excluded so an unchanged incident does not create a new
 * fingerprint every time the monitor runs.
 */
export function cronHealthAlertFingerprint(
  dispatcherSilent: boolean,
  stalePaths: readonly string[],
): string {
  const normalized = JSON.stringify({
    dispatcherSilent,
    stalePaths: [...new Set(stalePaths)].sort(),
  })
  return createHash("sha256").update(normalized).digest("hex")
}

/**
 * Stable identity for one occurrence of a cron-health failure set.
 *
 * The fingerprint identifies which checks are failing. This anchor identifies
 * when that particular failure occurrence began. A task that recovers and
 * later becomes stale again therefore alerts immediately even if recovery was
 * unable to clear Redis state. Relative ages are deliberately excluded.
 */
export function cronHealthAlertIncidentAnchor(
  dispatcherSilent: boolean,
  dispatcherLastRunEpochSeconds: string | null,
  staleTasks: readonly CronHealthIncidentTask[],
): string {
  const normalized = JSON.stringify({
    dispatcherLastRunEpochSeconds: dispatcherSilent ? dispatcherLastRunEpochSeconds : null,
    staleTasks: [...staleTasks]
      .map((task) => ({
        path: task.path,
        lastSuccessEpochSeconds: task.lastSuccessEpochSeconds,
        scheduleUpdatedEpochSeconds: task.scheduleUpdatedEpochSeconds,
      }))
      .sort((left, right) => left.path.localeCompare(right.path)),
  })
  return createHash("sha256").update(normalized).digest("hex")
}
