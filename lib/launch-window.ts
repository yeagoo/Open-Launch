import { LAUNCH_SETTINGS } from "@/lib/constants"

export interface LaunchWindow {
  start: Date
  end: Date
}

export function getLaunchWindowForDate(date: Date = new Date()): LaunchWindow {
  // Launches are defined by the product clock, not by server-local midnight.
  // Keep this aligned with LAUNCH_SETTINGS.LAUNCH_HOUR_UTC, the update-launches
  // cron schedule, and the scheduling UI copy.
  const start = new Date(date)
  start.setUTCHours(LAUNCH_SETTINGS.LAUNCH_HOUR_UTC, 0, 0, 0)
  if (date < start) {
    start.setUTCDate(start.getUTCDate() - 1)
  }

  const end = new Date(start)
  end.setUTCDate(start.getUTCDate() + 1)

  return { start, end }
}

export function getCurrentLaunchWindow(now: Date = new Date()): LaunchWindow {
  return getLaunchWindowForDate(now)
}
