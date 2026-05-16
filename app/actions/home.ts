"use server"

import { unstable_cache } from "next/cache"

import { db } from "@/drizzle/db"
import {
  fumaComments,
  launchStatus,
  launchType,
  project as projectTable,
  upvote,
} from "@/drizzle/db/schema"
import { endOfMonth, startOfMonth } from "date-fns"
import { and, desc, eq, sql } from "drizzle-orm"

import { HOME_PROJECTS_TAG, WINNERS_TAG } from "@/lib/cache-tags"
import { LAUNCH_SETTINGS, PROJECT_LIMITS_VARIABLES } from "@/lib/constants"
import { attachCategories, getUpvotedSet, withUserUpvoted } from "@/lib/project-enrich"
import { getCurrentUserId } from "@/lib/server-auth"

// Reusable project-summary projection — the 4 listings on home /
// winners all need the exact same columns, and duplicating them is
// how `dailyRanking` and `commentCount` drift apart between
// listings during refactors.
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

// ─── User-agnostic cached fetchers ──────────────────────────────────────────
// Each base fetcher is wrapped with `unstable_cache` so multiple
// home-page renders share one DB round-trip per cache window.
// User-specific augmentation (`userHasUpvoted`) is bolted on in the
// public entry points below.

const fetchTodayProjectsBase = unstable_cache(
  async (limit: number) => {
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
  async (limit: number, queryStartIso: string, yesterdayEndIso: string) => {
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
  async (limit: number, monthStartIso: string, monthEndIso: string) => {
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

const fetchWinnersByDateBase = unstable_cache(
  async (dayStartIso: string, dayEndIso: string) => {
    const base = await db
      .select(projectSummarySelect)
      .from(projectTable)
      .leftJoin(upvote, eq(upvote.projectId, projectTable.id))
      .leftJoin(fumaComments, sql`"fuma_comments"."page"::text = ${projectTable.id}`)
      .where(
        and(
          eq(projectTable.launchStatus, launchStatus.LAUNCHED),
          sql`${projectTable.dailyRanking} IS NOT NULL`,
          sql`${projectTable.dailyRanking} <= 3`,
          sql`${projectTable.scheduledLaunchDate} >= ${dayStartIso}`,
          sql`${projectTable.scheduledLaunchDate} <= ${dayEndIso}`,
        ),
      )
      .groupBy(projectTable.id)
      .orderBy(projectTable.dailyRanking)
    return attachCategories(base)
  },
  ["winners-by-date-v1"],
  // Past winners are immutable once the 8 AM cron has stamped
  // `dailyRanking`. 6h is generous; tag-bust still catches the
  // initial transition.
  { revalidate: 21600, tags: [HOME_PROJECTS_TAG, WINNERS_TAG] },
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
  const isBeforeLaunchTime = now.getUTCHours() < LAUNCH_SETTINGS.LAUNCH_HOUR_UTC
  const yesterdayStart = new Date(now)
  yesterdayStart.setUTCHours(LAUNCH_SETTINGS.LAUNCH_HOUR_UTC, 0, 0, 0)
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
  const dayStart = new Date(date)
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(date)
  dayEnd.setHours(23, 59, 59, 999)

  const [base, userId] = await Promise.all([
    fetchWinnersByDateBase(dayStart.toISOString(), dayEnd.toISOString()),
    getCurrentUserId(),
  ])
  const upvoted = await getUpvotedSet(
    userId,
    base.map((p) => p.id),
  )
  return withUserUpvoted(base, upvoted)
}
