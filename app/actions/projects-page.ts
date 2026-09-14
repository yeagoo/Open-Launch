"use server"

import { db } from "@/drizzle/db"
import { launchStatus, project as projectTable } from "@/drizzle/db/schema"
import { endOfMonth, startOfMonth } from "date-fns"
import { and, count, desc, eq, or, sql } from "drizzle-orm"

import { localizeProjectDescriptions } from "@/lib/get-project-translation"
import {
  attachCategories,
  getProjectEngagementCounts,
  getUpvotedSet,
  withEngagementCounts,
  withUserUpvoted,
} from "@/lib/project-enrich"
import { clampInteger, clampPage } from "@/lib/query-limits"
import { getCurrentUserId } from "@/lib/server-auth"

export async function getMonthProjects(page: number = 1, limit: number = 10, locale?: string) {
  page = clampPage(page)
  limit = clampInteger(limit, 10, 1, 100)
  const now = new Date()
  const monthStart = startOfMonth(now)
  const monthEnd = endOfMonth(now)
  const offset = (page - 1) * limit

  // First, resolve the page's project IDs, total, and current user together.
  // The remaining data depends on those IDs, so it is started as one parallel
  // stage below instead of expanding upvotes × comments in this query.
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
      })
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

  const projectIds = monthProjectsBase.map((project) => project.id)
  const [categorizedProjects, engagementCounts, upvoted, localizedProjects] = await Promise.all([
    attachCategories(monthProjectsBase),
    getProjectEngagementCounts(projectIds),
    getUpvotedSet(userId, projectIds),
    locale
      ? localizeProjectDescriptions(monthProjectsBase, locale)
      : Promise.resolve(monthProjectsBase),
  ])

  const localizedDescriptions = new Map(
    localizedProjects.map((project) => [project.id, project.description]),
  )
  const projectsWithEngagement = withEngagementCounts(categorizedProjects, engagementCounts)
  const projects = withUserUpvoted(
    projectsWithEngagement.map((project) => ({
      ...project,
      // The localization helper preserves the original description when no
      // usable translation exists; retain it here as a type- and data-safe
      // fallback if an incomplete row ever reaches this list.
      description: localizedDescriptions.get(project.id) ?? project.description,
    })),
    upvoted,
  )
  const totalCount = totalCountResult[0]?.count ?? 0

  return {
    projects,
    totalCount,
    totalPages: Math.ceil(totalCount / limit),
  }
}
