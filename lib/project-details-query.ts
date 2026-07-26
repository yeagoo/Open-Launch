import "server-only"

import { cache } from "react"

import { db } from "@/drizzle/db"
import {
  category,
  fumaComments,
  launchStatus,
  project,
  projectToCategory,
  upvote,
  user,
} from "@/drizzle/db/schema"
import { and, eq, ne, sql } from "drizzle-orm"

import { getCurrentUserId } from "@/lib/server-auth"

const MAX_SLUG_LENGTH = 200

/**
 * Internal server-only project lookup.
 *
 * This deliberately lives outside a `"use server"` module so it is not
 * published in Next.js' Server Action manifest. Both the project and creator
 * selects are explicit: public pages must never serialize billing, moderation,
 * crawler, or account fields that they do not render.
 */
export const getProjectBySlug = cache(async (rawSlug: string) => {
  const slug = rawSlug.trim()
  if (!slug || slug.length > MAX_SLUG_LENGTH) return null

  const [projectData] = await db
    .select({
      id: project.id,
      name: project.name,
      slug: project.slug,
      description: project.description,
      websiteUrl: project.websiteUrl,
      logoUrl: project.logoUrl,
      coverImageUrl: project.coverImageUrl,
      productImage: project.productImage,
      githubUrl: project.githubUrl,
      twitterUrl: project.twitterUrl,
      techStack: project.techStack,
      pricing: project.pricing,
      platforms: project.platforms,
      launchStatus: project.launchStatus,
      scheduledLaunchDate: project.scheduledLaunchDate,
      launchType: project.launchType,
      dailyRanking: project.dailyRanking,
      hasBadgeVerified: project.hasBadgeVerified,
      sourceLocale: project.sourceLocale,
      isLowQuality: project.isLowQuality,
      updatedAt: project.updatedAt,
      createdBy: project.createdBy,
    })
    .from(project)
    .where(and(eq(project.slug, slug), ne(project.launchStatus, launchStatus.PAYMENT_PENDING)))
    .limit(1)

  if (!projectData) return null

  const [creator, categories, upvoteCount, commentCount] = await Promise.all([
    projectData.createdBy
      ? db
          .select({
            id: user.id,
            name: user.name,
            image: sql<
              string | null
            >`case when ${user.image} like 'data:%' then null else ${user.image} end`,
          })
          .from(user)
          .where(eq(user.id, projectData.createdBy))
          .limit(1)
          .then((rows) => rows[0] ?? null)
      : Promise.resolve(null),
    db
      .select({
        id: category.id,
        name: category.name,
      })
      .from(category)
      .innerJoin(projectToCategory, eq(category.id, projectToCategory.categoryId))
      .where(eq(projectToCategory.projectId, projectData.id)),
    db
      .select({ count: sql`count(*)` })
      .from(upvote)
      .where(eq(upvote.projectId, projectData.id))
      .then((rows) => rows[0]),
    db
      .select({ count: sql`count(*)` })
      .from(fumaComments)
      .where(sql`${fumaComments.page}::text = ${projectData.id}`)
      .then((rows) => rows[0]),
  ])

  return {
    ...projectData,
    categories,
    upvoteCount: Number(upvoteCount?.count || 0),
    commentCount: Number(commentCount?.count || 0),
    creator,
  }
})

export async function hasUserUpvoted(projectId: string) {
  const userId = await getCurrentUserId()
  if (!userId) return false

  const userUpvotes = await db
    .select({ id: upvote.id })
    .from(upvote)
    .where(and(eq(upvote.userId, userId), eq(upvote.projectId, projectId)))
    .limit(1)

  return userUpvotes.length > 0
}
