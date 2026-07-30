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
 * Most recent scheduled fire-time at or before `now` for a cron expression,
 * or null if the expression is invalid. Used by the cron-health monitor to
 * answer "when should this task have last run?" so staleness is judged
 * against each task's own cadence (a daily job and a 5-min job have very
 * different acceptable gaps) instead of a single hardcoded threshold.
 */
export function previousFireTime(expression: string, now: Date = new Date()): Date | null {
  if (!hasFiveFields(expression)) return null
  try {
    const interval = CronExpressionParser.parse(expression, {
      currentDate: now,
      tz: "UTC",
    })
    return interval.prev().toDate()
  } catch {
    return null
  }
}

/**
 * Enumerate scheduled UTC fire-times in an inclusive minute range while
 * parsing the expression only once. Materialization uses this instead of
 * calling cronMatches for every task × minute during catch-up.
 */
export function scheduledFireTimesBetween(
  expression: string,
  start: Date,
  end: Date,
  maxResults = 20_000,
): Date[] {
  if (!hasFiveFields(expression) || start.getTime() > end.getTime()) return []
  if (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > 50_000) {
    throw new Error("maxResults must be an integer between 1 and 50000")
  }
  const minuteStart = new Date(start)
  minuteStart.setUTCSeconds(0, 0)
  const minuteEnd = new Date(end)
  minuteEnd.setUTCSeconds(0, 0)

  try {
    const interval = CronExpressionParser.parse(expression, {
      currentDate: new Date(minuteStart.getTime() - 1),
      tz: "UTC",
    })
    const results: Date[] = []
    while (true) {
      const next = interval.next().toDate()
      if (next.getTime() > minuteEnd.getTime()) break
      results.push(next)
      if (results.length > maxResults) {
        throw new Error(`cron fire-time enumeration exceeded ${maxResults} results`)
      }
    }
    return results
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("cron fire-time enumeration")) {
      throw error
    }
    return []
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
