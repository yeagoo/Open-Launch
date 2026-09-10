export function uniqueProjectIdsFromGroups<T extends { id: string }>(
  groups: readonly (readonly T[])[],
): string[] {
  return [...new Set(groups.flatMap((group) => group.map((project) => project.id)))]
}

export function getUtcMonthWindow(now: Date): { start: Date; end: Date } {
  if (!Number.isFinite(now.getTime())) throw new Error("month window requires a valid date")
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
  return { start, end }
}

/**
 * Rolling 7-day window for the home page's "Weekly" tab.
 *
 * Deliberately NOT a calendar week: a Monday-anchored window would show an
 * almost-empty leaderboard every Monday morning, whereas a trailing window
 * always has seven days of data behind it. The end bound is `now`, so the
 * window is half-open [now-7d, now) — same convention as the month window,
 * which is what lets both share one cached fetcher shape.
 */
export function getUtcWeekWindow(now: Date): { start: Date; end: Date } {
  if (!Number.isFinite(now.getTime())) throw new Error("week window requires a valid date")
  const start = new Date(now)
  start.setUTCDate(start.getUTCDate() - 7)
  return { start, end: new Date(now) }
}

export function attachUserUpvotesToGroups<T extends { id: string }>(
  groups: readonly (readonly T[])[],
  upvoted: ReadonlySet<string>,
): (T & { userHasUpvoted: boolean })[][] {
  return groups.map((group) =>
    group.map((project) => ({
      ...project,
      userHasUpvoted: upvoted.has(project.id),
    })),
  )
}
