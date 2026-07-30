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
