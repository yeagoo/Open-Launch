"use server"

import { unstable_cache } from "next/cache"
import { headers } from "next/headers"

import { db } from "@/drizzle/db"
import {
  category as categoryTable,
  fumaComments,
  launchStatus,
  launchType,
  project as projectTable,
  projectToCategory,
  upvote,
} from "@/drizzle/db/schema"
import { endOfMonth, startOfMonth } from "date-fns"
import { and, desc, eq, inArray, sql } from "drizzle-orm"

import { auth } from "@/lib/auth"
import { HOME_PROJECTS_TAG } from "@/lib/cache-tags"
import { PROJECT_LIMITS_VARIABLES } from "@/lib/constants"

async function getCurrentUserId() {
  const session = await auth.api.getSession({ headers: await headers() })
  return session?.user?.id ?? null
}

interface ProjectBase {
  id: string
  name: string
  slug: string
  description: string
  logoUrl: string
  websiteUrl: string
  launchStatus: string
  launchType: string | null
  dailyRanking: number | null
  scheduledLaunchDate: Date | null
  createdAt: Date
  upvoteCount: number
  commentCount: number
  categories: { id: string; name: string }[]
}

// Reusable project-summary projection — the 3 home-page listings
// (today / yesterday / month) all need the exact same columns, and
// duplicating them is how `dailyRanking` and `commentCount` drift
// apart between listings during refactors.
const projectSummarySelect = {
  id: projectTable.id,
  name: projectTable.name,
  slug: projectTable.slug,
  description: projectTable.description,
  logoUrl: projectTable.logoUrl,
  websiteUrl: projectTable.websiteUrl,
  launchStatus: projectTable.launchStatus,
  launchType: projectTable.launchType,
  dailyRanking: projectTable.dailyRanking,
  scheduledLaunchDate: projectTable.scheduledLaunchDate,
  createdAt: projectTable.createdAt,
  upvoteCount: sql<number>`cast(count(distinct ${upvote.id}) as int)`.mapWith(Number),
  commentCount: sql<number>`cast(count(distinct ${fumaComments.id}) as int)`.mapWith(Number),
} as const

// Attaches categories to a project list. User-agnostic — folded
// into the cached fetchers so cached pages don't re-issue this
// query per request.
async function attachCategories<T extends { id: string }>(
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

// Looks up which of `projectIds` the user has upvoted. Per-request
// (depends on the signed-in user), so it's outside the cached
// fetchers and intentionally fast: indexed `(user_id, project_id)`
// is the access path.
async function getUpvotedSet(userId: string | null, projectIds: string[]): Promise<Set<string>> {
  if (!userId || !projectIds.length) return new Set()
  const rows = await db
    .select({ projectId: upvote.projectId })
    .from(upvote)
    .where(and(eq(upvote.userId, userId), inArray(upvote.projectId, projectIds)))
  return new Set(rows.map((r) => r.projectId))
}

function withUserUpvoted<T extends { id: string }>(projects: T[], upvoted: Set<string>) {
  return projects.map((p) => ({ ...p, userHasUpvoted: upvoted.has(p.id) }))
}

// ─── User-agnostic cached fetchers ──────────────────────────────────────────
// Each base fetcher is wrapped with `unstable_cache` so multiple
// home-page renders share one DB round-trip per cache window.
// User-specific augmentation (`userHasUpvoted`) is bolted on in the
// public entry points below.

const fetchTodayProjectsBase = unstable_cache(
  async (limit: number): Promise<ProjectBase[]> => {
    const base = await db
      .select(projectSummarySelect)
      .from(projectTable)
      .leftJoin(upvote, eq(upvote.projectId, projectTable.id))
      .leftJoin(fumaComments, sql`"fuma_comments"."page"::text = ${projectTable.id}`)
      .where(eq(projectTable.launchStatus, launchStatus.ONGOING))
      .groupBy(projectTable.id)
      .orderBy(desc(sql`count(distinct ${upvote.id})`))
      .limit(limit)
    return attachCategories(base)
  },
  ["home-today-projects-v1"],
  // 10 minutes covers the "live counter" expectation — fresh
  // upvotes/comments lag by at most 10 min, acceptable for a
  // launches feed. The 8 AM UTC `update-launches` cron explicitly
  // busts HOME_PROJECTS_TAG so today/yesterday transitions go live
  // instantly.
  { revalidate: 600, tags: [HOME_PROJECTS_TAG] },
)

const fetchYesterdayProjectsBase = unstable_cache(
  async (limit: number, queryStartIso: string, yesterdayEndIso: string): Promise<ProjectBase[]> => {
    const base = await db
      .select(projectSummarySelect)
      .from(projectTable)
      .leftJoin(upvote, eq(upvote.projectId, projectTable.id))
      .leftJoin(fumaComments, sql`"fuma_comments"."page"::text = ${projectTable.id}`)
      .where(
        and(
          eq(projectTable.launchStatus, launchStatus.LAUNCHED),
          sql`${projectTable.scheduledLaunchDate} >= ${queryStartIso}`,
          sql`${projectTable.scheduledLaunchDate} < ${yesterdayEndIso}`,
        ),
      )
      .groupBy(projectTable.id)
      .orderBy(desc(sql`count(distinct ${upvote.id})`))
      .limit(limit)
    return attachCategories(base)
  },
  ["home-yesterday-projects-v1"],
  // Yesterday's set is locked once we cross 8 AM UTC — 1h cache
  // is conservative; in practice it could be much longer.
  { revalidate: 3600, tags: [HOME_PROJECTS_TAG] },
)

const fetchMonthBestProjectsBase = unstable_cache(
  async (limit: number, monthStartIso: string, monthEndIso: string): Promise<ProjectBase[]> => {
    const base = await db
      .select(projectSummarySelect)
      .from(projectTable)
      .leftJoin(upvote, eq(upvote.projectId, projectTable.id))
      .leftJoin(fumaComments, sql`"fuma_comments"."page"::text = ${projectTable.id}`)
      .where(
        and(
          eq(projectTable.launchStatus, launchStatus.LAUNCHED),
          sql`${projectTable.scheduledLaunchDate} >= ${monthStartIso}`,
          sql`${projectTable.scheduledLaunchDate} <= ${monthEndIso}`,
        ),
      )
      .groupBy(projectTable.id)
      .orderBy(desc(sql`count(distinct ${upvote.id})`))
      .limit(limit)
    return attachCategories(base)
  },
  ["home-month-projects-v1"],
  { revalidate: 3600, tags: [HOME_PROJECTS_TAG] },
)

// ─── Public entry points ────────────────────────────────────────────────────

export async function getTodayProjects(limit: number = PROJECT_LIMITS_VARIABLES.TODAY_LIMIT) {
  const [base, userId] = await Promise.all([fetchTodayProjectsBase(limit), getCurrentUserId()])
  const upvoted = await getUpvotedSet(
    userId,
    base.map((p) => p.id),
  )
  return withUserUpvoted(base, upvoted)
}

export async function getYesterdayProjects(
  limit: number = PROJECT_LIMITS_VARIABLES.YESTERDAY_LIMIT,
) {
  const now = new Date()
  const isBeforeLaunchTime = now.getUTCHours() < 8
  const yesterdayStart = new Date(now)
  yesterdayStart.setUTCHours(8, 0, 0, 0)
  if (isBeforeLaunchTime) {
    yesterdayStart.setDate(yesterdayStart.getDate() - 2)
  } else {
    yesterdayStart.setDate(yesterdayStart.getDate() - 1)
  }
  const yesterdayEnd = new Date(yesterdayStart)
  yesterdayEnd.setDate(yesterdayEnd.getDate() + 1)

  // Extend window start to midnight to include projects launched at 00:00
  const queryStart = new Date(yesterdayStart)
  queryStart.setUTCHours(0, 0, 0, 0)

  const [base, userId] = await Promise.all([
    fetchYesterdayProjectsBase(limit, queryStart.toISOString(), yesterdayEnd.toISOString()),
    getCurrentUserId(),
  ])
  const upvoted = await getUpvotedSet(
    userId,
    base.map((p) => p.id),
  )
  return withUserUpvoted(base, upvoted)
}

export async function getMonthBestProjects(limit: number = PROJECT_LIMITS_VARIABLES.MONTH_LIMIT) {
  const now = new Date()
  const monthStart = startOfMonth(now)
  const monthEnd = endOfMonth(now)

  const [base, userId] = await Promise.all([
    fetchMonthBestProjectsBase(limit, monthStart.toISOString(), monthEnd.toISOString()),
    getCurrentUserId(),
  ])
  const upvoted = await getUpvotedSet(
    userId,
    base.map((p) => p.id),
  )
  return withUserUpvoted(base, upvoted)
}

export async function getFeaturedPremiumProjects() {
  const projects = await db.query.project.findMany({
    where: and(
      eq(projectTable.featuredOnHomepage, true),
      eq(projectTable.launchType, launchType.PREMIUM_PLUS),
      eq(projectTable.launchStatus, launchStatus.ONGOING),
    ),
    columns: {
      id: true,
      name: true,
      slug: true,
      description: true,
      logoUrl: true,
      websiteUrl: true,
      launchStatus: true,
      launchType: true,
      dailyRanking: true,
    },
    limit: 3,
    orderBy: [desc(projectTable.createdAt)],
  })
  return projects
}

export async function getYesterdayTopProjects() {
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  yesterday.setHours(0, 0, 0, 0)
  const yesterdayEnd = new Date(yesterday)
  yesterdayEnd.setHours(23, 59, 59, 999)

  const topProjects = await db
    .select({
      id: projectTable.id,
      name: projectTable.name,
      slug: projectTable.slug,
      logoUrl: projectTable.logoUrl,
      dailyRanking: projectTable.dailyRanking,
    })
    .from(projectTable)
    .where(
      and(
        eq(projectTable.launchStatus, launchStatus.LAUNCHED),
        sql`${projectTable.dailyRanking} IS NOT NULL`,
        sql`${projectTable.scheduledLaunchDate} >= ${yesterday.toISOString()}`,
        sql`${projectTable.scheduledLaunchDate} <= ${yesterdayEnd.toISOString()}`,
      ),
    )
    .orderBy(projectTable.dailyRanking)
    .limit(3)

  return topProjects
}

export async function getWinnersByDate(date: Date) {
  const userId = await getCurrentUserId()
  const dayStart = new Date(date)
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(date)
  dayEnd.setHours(23, 59, 59, 999)

  const winnersBase = await db
    .select(projectSummarySelect)
    .from(projectTable)
    .leftJoin(upvote, eq(upvote.projectId, projectTable.id))
    .leftJoin(fumaComments, sql`"fuma_comments"."page"::text = ${projectTable.id}`)
    .where(
      and(
        eq(projectTable.launchStatus, launchStatus.LAUNCHED),
        sql`${projectTable.dailyRanking} IS NOT NULL`,
        sql`${projectTable.dailyRanking} <= 3`,
        sql`${projectTable.scheduledLaunchDate} >= ${dayStart.toISOString()}`,
        sql`${projectTable.scheduledLaunchDate} <= ${dayEnd.toISOString()}`,
      ),
    )
    .groupBy(projectTable.id)
    .orderBy(projectTable.dailyRanking)

  const withCats = await attachCategories(winnersBase)
  const upvoted = await getUpvotedSet(
    userId,
    withCats.map((p) => p.id),
  )
  return withUserUpvoted(withCats, upvoted)
}
