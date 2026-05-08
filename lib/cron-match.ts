/**
 * Minute-precision cron matcher used by the dispatcher.
 *
 * The dispatcher fires once per minute. For every task in cron_schedule we
 * ask: did the task's cron expression schedule a fire-time within the
 * minute that contains `now`? If yes, run the task this tick.
 *
 * cron-parser handles standard 5-field expressions (m h dom mon dow) plus
 * common extensions like `*\/5` and lists `1,15,30`. UTC by convention —
 * the seeded schedules and the dispatcher both use UTC.
 */

import { CronExpressionParser } from "cron-parser"

export function cronMatches(expression: string, now: Date = new Date()): boolean {
  if (!hasFiveFields(expression)) return false
  try {
    // Window = [start_of_minute, start_of_minute + 60s).
    // Anchor the parser one ms before the window so `next()` returns the
    // first scheduled tick at-or-after the window start. If that tick
    // lands inside the window, fire this minute.
    const minuteStart = new Date(now)
    minuteStart.setUTCSeconds(0, 0)
    const interval = CronExpressionParser.parse(expression, {
      currentDate: new Date(minuteStart.getTime() - 1),
      tz: "UTC",
    })
    const next = interval.next().toDate()
    const diff = next.getTime() - minuteStart.getTime()
    return diff >= 0 && diff < 60_000
  } catch {
    return false
  }
}

/**
 * Sanity-check a cron expression. Used by admin form server actions
 * before persisting an edit so we never store an unparseable schedule.
 */
export function isValidCronExpression(expression: string): boolean {
  if (!hasFiveFields(expression)) return false
  try {
    CronExpressionParser.parse(expression, { tz: "UTC" })
    return true
  } catch {
    return false
  }
}

// cron-parser is lenient about whitespace/short input — enforce the standard
// 5-field shape ourselves so empty strings and 3-field input are rejected.
function hasFiveFields(expression: string): boolean {
  return expression.trim().split(/\s+/).filter(Boolean).length === 5
}
