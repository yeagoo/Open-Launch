import { db } from "@/drizzle/db"
import {
  category as categoryTable,
  fumaComments,
  projectToCategory,
  upvote,
} from "@/drizzle/db/schema"
import { and, eq, inArray, sql } from "drizzle-orm"

/**
 * Shared project-list enrichment helpers.
 *
 * Used to live as duplicate `enrichProjectsWithUserData` functions
 * inside `app/actions/home.ts`, `app/actions/projects-page.ts`,
 * and `app/actions/tags.ts`. The duplicates were drifting and all
 * shared the same N+1 perf footgun (sequential categories +
 * upvotes queries instead of parallel). Consolidated here so the
 * fix lives in one place.
 *
 * Naming convention:
 *  - `attachCategories` is user-agnostic and safe to wrap in
 *    `unstable_cache` at the call site.
 *  - `getUpvotedSet` is per-request (depends on the signed-in user)
 *    and must NOT be cached.
 *  - `withUserUpvoted` is pure transform.
 */

export async function attachCategories<T extends { id: string }>(
  projects: T[],
): Promise<(T & { categories: { id: string; name: string }[] })[]> {
  if (!projects.length) return []
  const projectIds = projects.map((p) => p.id)
  const rows = await db
    .select({
      projectId: projectToCategory.projectId,
      categoryId: categoryTable.id,
      categoryName: categoryTable.name,
    })
    .from(projectToCategory)
    .innerJoin(categoryTable, eq(categoryTable.id, projectToCategory.categoryId))
    .where(inArray(projectToCategory.projectId, projectIds))

  const byId = new Map<string, { id: string; name: string }[]>()
  for (const r of rows) {
    const existing = byId.get(r.projectId)
    const entry = { id: r.categoryId, name: r.categoryName }
    if (existing) existing.push(entry)
    else byId.set(r.projectId, [entry])
  }
  return projects.map((p) => ({ ...p, categories: byId.get(p.id) ?? [] }))
}

/**
 * Returns the set of `projectIds` the user has upvoted. Returns
 * empty set when `userId` is null (anonymous viewer) or
 * `projectIds` is empty.
 *
 * Indexed access path: `(user_id, project_id)` on `upvote`.
 */
export async function getUpvotedSet(
  userId: string | null,
  projectIds: string[],
): Promise<Set<string>> {
  if (!userId || !projectIds.length) return new Set()
  const rows = await db
    .select({ projectId: upvote.projectId })
    .from(upvote)
    .where(and(eq(upvote.userId, userId), inArray(upvote.projectId, projectIds)))
  return new Set(rows.map((r) => r.projectId))
}

export interface ProjectEngagementCounts {
  upvoteCount: number
  commentCount: number
}

/**
 * Reads engagement for only the projects rendered by a list page.
 *
 * Counting after joining both `upvote` and `fuma_comments` produces one row
 * per upvote/comment pair and forces `count(distinct ...)` to repair that
 * multiplication. These two indexed, batched aggregates avoid the expanded
 * intermediate result and can run alongside the other list enrichments.
 */
export async function getProjectEngagementCounts(
  projectIds: string[],
): Promise<Map<string, ProjectEngagementCounts>> {
  if (!projectIds.length) return new Map()

  const [upvoteRows, commentRows] = await Promise.all([
    db
      .select({
        projectId: upvote.projectId,
        upvoteCount: sql<number>`cast(count(${upvote.id}) as int)`.mapWith(Number),
      })
      .from(upvote)
      .where(inArray(upvote.projectId, projectIds))
      .groupBy(upvote.projectId),
    db
      .select({
        projectId: fumaComments.page,
        commentCount: sql<number>`cast(count(${fumaComments.id}) as int)`.mapWith(Number),
      })
      .from(fumaComments)
      .where(inArray(fumaComments.page, projectIds))
      .groupBy(fumaComments.page),
  ])

  const counts = new Map<string, ProjectEngagementCounts>()
  for (const row of upvoteRows) {
    counts.set(row.projectId, { upvoteCount: row.upvoteCount, commentCount: 0 })
  }
  for (const row of commentRows) {
    const current = counts.get(row.projectId)
    counts.set(row.projectId, {
      upvoteCount: current?.upvoteCount ?? 0,
      commentCount: row.commentCount,
    })
  }
  return counts
}

export function withEngagementCounts<T extends { id: string }>(
  projects: T[],
  counts: Map<string, ProjectEngagementCounts>,
): (T & ProjectEngagementCounts)[] {
  return projects.map((project) => {
    const engagement = counts.get(project.id)
    return {
      ...project,
      upvoteCount: engagement?.upvoteCount ?? 0,
      commentCount: engagement?.commentCount ?? 0,
    }
  })
}

export function withUserUpvoted<T extends { id: string }>(projects: T[], upvoted: Set<string>) {
  return projects.map((p) => ({ ...p, userHasUpvoted: upvoted.has(p.id) }))
}

/**
 * Convenience: parallel categories + upvotes enrichment. Use this
 * when neither piece is being cached upstream — the common case
 * for paginated listings.
 *
 * If `attachCategories` is wrapped in `unstable_cache` at the
 * caller, prefer calling the helpers individually so the cached
 * call isn't blocked by the user-specific upvote lookup.
 */
export async function enrichWithCategoriesAndUpvotes<T extends { id: string }>(
  projects: T[],
  userId: string | null,
): Promise<(T & { categories: { id: string; name: string }[]; userHasUpvoted: boolean })[]> {
  if (!projects.length) return []
  const [withCats, upvoted] = await Promise.all([
    attachCategories(projects),
    getUpvotedSet(
      userId,
      projects.map((p) => p.id),
    ),
  ])
  return withUserUpvoted(withCats, upvoted)
}
