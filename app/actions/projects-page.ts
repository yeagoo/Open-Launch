"use server"

import { db } from "@/drizzle/db"
import { fumaComments, launchStatus, project as projectTable, upvote } from "@/drizzle/db/schema"
import { endOfMonth, startOfMonth } from "date-fns"
import { and, count, desc, eq, or, sql } from "drizzle-orm"

import { enrichWithCategoriesAndUpvotes } from "@/lib/project-enrich"
import { getCurrentUserId } from "@/lib/server-auth"

export async function getMonthProjects(page: number = 1, limit: number = 10) {
  const now = new Date()
  const monthStart = startOfMonth(now)
  const monthEnd = endOfMonth(now)
  const offset = (page - 1) * limit

  // Get projects for current month + count + user, all in parallel.
  // Previously these were 4 sequential awaits.
  const [monthProjectsBase, totalCountResult, userId] = await Promise.all([
    db
      .select({
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
      })
      .from(projectTable)
      .leftJoin(upvote, eq(upvote.projectId, projectTable.id))
      .leftJoin(fumaComments, sql`"fuma_comments"."page"::text = ${projectTable.id}`)
      .where(
        and(
          or(
            eq(projectTable.launchStatus, launchStatus.LAUNCHED),
            eq(projectTable.launchStatus, launchStatus.ONGOING),
          ),
          sql`${projectTable.scheduledLaunchDate} >= ${monthStart.toISOString()}`,
          sql`${projectTable.scheduledLaunchDate} <= ${monthEnd.toISOString()}`,
        ),
      )
      .groupBy(projectTable.id)
      .orderBy(desc(projectTable.scheduledLaunchDate))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: count(projectTable.id) })
      .from(projectTable)
      .where(
        and(
          or(
            eq(projectTable.launchStatus, launchStatus.LAUNCHED),
            eq(projectTable.launchStatus, launchStatus.ONGOING),
          ),
          sql`${projectTable.scheduledLaunchDate} >= ${monthStart.toISOString()}`,
          sql`${projectTable.scheduledLaunchDate} <= ${monthEnd.toISOString()}`,
        ),
      ),
    getCurrentUserId(),
  ])

  const totalCount = totalCountResult[0]?.count || 0
  const enrichedProjects = await enrichWithCategoriesAndUpvotes(monthProjectsBase, userId)

  return {
    projects: enrichedProjects,
    totalCount,
    totalPages: Math.ceil(totalCount / limit),
  }
}
