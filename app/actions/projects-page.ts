"use server"

import { headers } from "next/headers"

import { db } from "@/drizzle/db"
import {
  category as categoryTable,
  fumaComments,
  launchStatus,
  project as projectTable,
  projectToCategory,
  upvote,
} from "@/drizzle/db/schema"
import { endOfMonth, startOfMonth } from "date-fns"
import { and, count, desc, eq, or, sql } from "drizzle-orm"

import { auth } from "@/lib/auth"

async function getCurrentUserId() {
  const session = await auth.api.getSession({ headers: await headers() })
  return session?.user?.id ?? null
}

async function enrichProjectsWithUserData<T extends { id: string }>(
  projects: T[],
  userId: string | null,
): Promise<
  (T & {
    userHasUpvoted: boolean
    categories: { id: string; name: string }[]
  })[]
> {
  if (!projects.length) return []

  const projectIds = projects.map((p) => p.id)

  const categoriesData = await db
    .select({
      projectId: projectToCategory.projectId,
      categoryId: categoryTable.id,
      categoryName: categoryTable.name,
    })
    .from(projectToCategory)
    .innerJoin(categoryTable, eq(categoryTable.id, projectToCategory.categoryId))
    .where(sql`${projectToCategory.projectId} IN ${projectIds}`)

  const categoriesByProjectId = categoriesData.reduce(
    (acc, row) => {
      if (!acc[row.projectId]) {
        acc[row.projectId] = []
      }
      acc[row.projectId].push({ id: row.categoryId, name: row.categoryName })
      return acc
    },
    {} as Record<string, { id: string; name: string }[]>,
  )

  let userUpvotedProjectIds = new Set<string>()
  if (userId) {
    const userUpvotes = await db
      .select({ projectId: upvote.projectId })
      .from(upvote)
      .where(and(eq(upvote.userId, userId), sql`${upvote.projectId} IN ${projectIds}`))
    userUpvotedProjectIds = new Set(userUpvotes.map((uv) => uv.projectId))
  }

  return projects.map((project) => ({
    ...project,
    userHasUpvoted: userUpvotedProjectIds.has(project.id),
    categories: categoriesByProjectId[project.id] || [],
  }))
}

export async function getMonthProjects(page: number = 1, limit: number = 10) {
  const userId = await getCurrentUserId()
  const now = new Date()
  const monthStart = startOfMonth(now)
  const monthEnd = endOfMonth(now)
  const offset = (page - 1) * limit

  // Get projects for current month
  const monthProjectsBase = await db
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
    .offset(offset)

  // Get total count for pagination
  const totalCountResult = await db
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
    )

  const totalCount = totalCountResult[0]?.count || 0

  const enrichedProjects = await enrichProjectsWithUserData(monthProjectsBase, userId)

  return {
    projects: enrichedProjects,
    totalCount,
    totalPages: Math.ceil(totalCount / limit),
  }
}
