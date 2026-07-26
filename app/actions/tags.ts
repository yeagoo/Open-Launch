"use server"

import { revalidatePath, revalidateTag } from "next/cache"
import { headers } from "next/headers"

import { db } from "@/drizzle/db"
import {
  fumaComments,
  project as projectTable,
  projectToTag,
  tagModerationStatus,
  tag as tagTable,
  upvote,
} from "@/drizzle/db/schema"
import { and, asc, count, desc, eq, inArray, or, sql } from "drizzle-orm"

import { auth } from "@/lib/auth"
import { SITEMAP_ENTRIES_TAG } from "@/lib/cache-tags"
import { enrichWithCategoriesAndUpvotes } from "@/lib/project-enrich"
import { clampInteger } from "@/lib/query-limits"
import { getCurrentUserId } from "@/lib/server-auth"

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getSession() {
  return auth.api.getSession({
    headers: await headers(),
  })
}

async function checkAdminAccess() {
  const session = await getSession()
  if (!session?.user || session.user.role !== "admin") {
    throw new Error("Unauthorized: Admin access required")
  }
  return session
}

function normalizeTag(raw: string): { id: string; name: string; slug: string } {
  const trimmed = raw.trim()
  const slug = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return { id: slug, name: trimmed, slug }
}

// ─── Public actions ──────────────────────────────────────────────────────────

export async function getAllTags(limit = 200) {
  limit = clampInteger(limit, 200, 1, 500)
  const tags = await db
    .select()
    .from(tagTable)
    .where(eq(tagTable.moderationStatus, tagModerationStatus.APPROVED))
    .orderBy(desc(tagTable.projectCount))
    .limit(limit)

  return tags
}

export async function getTagBySlug(slug: string) {
  const result = await db
    .select()
    .from(tagTable)
    .where(
      and(eq(tagTable.slug, slug), eq(tagTable.moderationStatus, tagModerationStatus.APPROVED)),
    )
    .limit(1)

  return result[0] || null
}

export async function getProjectsByTag(tagSlug: string, page = 1, limit = 10, sort = "recent") {
  const tagData = await getTagBySlug(tagSlug)
  if (!tagData) return { projects: [], totalCount: 0 }

  let orderByClause
  switch (sort) {
    case "upvotes":
      orderByClause = desc(sql`count(distinct ${upvote.id})`)
      break
    case "alphabetical":
      orderByClause = asc(projectTable.name)
      break
    case "recent":
    default:
      orderByClause = desc(projectTable.createdAt)
      break
  }

  page = Math.max(1, Math.floor(page) || 1)
  limit = Math.min(100, Math.max(1, Math.floor(limit) || 10))
  const offset = (page - 1) * limit

  const queryConditions = and(
    eq(projectToTag.tagId, tagData.id),
    or(eq(projectTable.launchStatus, "ongoing"), eq(projectTable.launchStatus, "launched")),
  )

  // Run the projects query, the count query, and the auth lookup
  // all in parallel. Previously these were sequential awaits, so
  // the count blocked the enrichment even though they share no
  // data.
  const [projectsData, totalResult, userId] = await Promise.all([
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
        upvoteCount: sql<number>`count(distinct ${upvote.id})`.mapWith(Number),
        commentCount: sql<number>`count(distinct ${fumaComments.id})`.mapWith(Number),
      })
      .from(projectTable)
      .innerJoin(projectToTag, eq(projectTable.id, projectToTag.projectId))
      .leftJoin(upvote, eq(upvote.projectId, projectTable.id))
      .leftJoin(fumaComments, sql`(${fumaComments.page}::text = ${projectTable.id}::text)`)
      .where(queryConditions)
      .groupBy(
        projectTable.id,
        projectTable.name,
        projectTable.slug,
        projectTable.description,
        projectTable.logoUrl,
        projectTable.websiteUrl,
        projectTable.launchStatus,
        projectTable.launchType,
        projectTable.dailyRanking,
        projectTable.scheduledLaunchDate,
        projectTable.createdAt,
      )
      .orderBy(orderByClause)
      .limit(limit)
      .offset(offset),
    db
      .select({ count: count(projectTable.id) })
      .from(projectTable)
      .innerJoin(projectToTag, eq(projectTable.id, projectToTag.projectId))
      .where(queryConditions),
    getCurrentUserId(),
  ])

  const enrichedProjects = await enrichWithCategoriesAndUpvotes(projectsData, userId)

  return {
    projects: enrichedProjects,
    totalCount: totalResult[0]?.count || 0,
  }
}

// ─── Authenticated actions ───────────────────────────────────────────────────

export async function upsertTagsForProject(projectId: string, tagNames: string[]) {
  const session = await getSession()
  if (!session?.user?.id) {
    return { success: false, tagIds: [] }
  }

  // Limit to 10 tags per project
  const tagsToProcess = tagNames.slice(0, 10)

  // Normalize and filter
  const normalizedTags = [
    ...new Map(
      tagsToProcess
        .map(normalizeTag)
        .filter((tag) => tag.slug.length >= 2 && tag.slug.length <= 30)
        .map((tag) => [tag.id, tag]),
    ).values(),
  ]

  const result = await db.transaction(async (tx) => {
    // Authorization and all association/count writes share one transaction so
    // a failure cannot leave a project with missing tags or stale counters.
    const [ownedProject] = await tx
      .select({ createdBy: projectTable.createdBy })
      .from(projectTable)
      .where(eq(projectTable.id, projectId))
      .limit(1)

    if (
      !ownedProject ||
      (session.user.role !== "admin" && ownedProject.createdBy !== session.user.id)
    ) {
      return { success: false, tagIds: [] }
    }

    const oldAssociations = await tx
      .select({ tagId: projectToTag.tagId })
      .from(projectToTag)
      .where(eq(projectToTag.projectId, projectId))

    if (normalizedTags.length === 0) {
      await tx.delete(projectToTag).where(eq(projectToTag.projectId, projectId))
      const oldTagIds = oldAssociations.map(({ tagId }) => tagId)
      if (oldTagIds.length > 0) {
        await tx
          .update(tagTable)
          .set({
            projectCount: sql`(SELECT count(*) FROM ${projectToTag} WHERE ${projectToTag.tagId} = ${tagTable.id})`,
            updatedAt: new Date(),
          })
          .where(inArray(tagTable.id, oldTagIds))
      }
      return { success: true, tagIds: [] }
    }

    await tx
      .insert(tagTable)
      .values(
        normalizedTags.map((tag) => ({
          id: tag.id,
          name: tag.name,
          slug: tag.slug,
          moderationStatus: tagModerationStatus.PENDING,
          projectCount: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
      )
      .onConflictDoNothing({ target: tagTable.id })

    await tx.delete(projectToTag).where(eq(projectToTag.projectId, projectId))
    await tx.insert(projectToTag).values(
      normalizedTags.map((tag) => ({
        projectId,
        tagId: tag.id,
      })),
    )

    const oldTagIds = oldAssociations.map(({ tagId }) => tagId)
    const newTagIds = normalizedTags.map((tag) => tag.id)
    const allAffectedTagIds = [...new Set([...oldTagIds, ...newTagIds])]
    if (allAffectedTagIds.length > 0) {
      await tx
        .update(tagTable)
        .set({
          projectCount: sql`(SELECT count(*) FROM ${projectToTag} WHERE ${projectToTag.tagId} = ${tagTable.id})`,
          updatedAt: new Date(),
        })
        .where(inArray(tagTable.id, allAffectedTagIds))
    }

    return { success: true, tagIds: newTagIds }
  })
  if (result.success) {
    revalidateTag(SITEMAP_ENTRIES_TAG, "max")
  }
  return result
}

// ─── Admin actions ───────────────────────────────────────────────────────────

export async function getFlaggedTags() {
  await checkAdminAccess()

  return db
    .select()
    .from(tagTable)
    .where(eq(tagTable.moderationStatus, tagModerationStatus.FLAGGED))
    .orderBy(desc(tagTable.createdAt))
}

export async function approveTag(tagId: string) {
  await checkAdminAccess()

  await db
    .update(tagTable)
    .set({
      moderationStatus: tagModerationStatus.APPROVED,
      moderationNote: null,
      updatedAt: new Date(),
    })
    .where(eq(tagTable.id, tagId))

  revalidatePath("/tags")
  revalidateTag(SITEMAP_ENTRIES_TAG, "max")
  revalidatePath("/admin/tags")
  return { success: true }
}

export async function deleteTag(tagId: string) {
  await checkAdminAccess()

  // Delete cascades through projectToTag via FK
  await db.delete(tagTable).where(eq(tagTable.id, tagId))

  revalidatePath("/tags")
  revalidateTag(SITEMAP_ENTRIES_TAG, "max")
  revalidatePath("/admin/tags")
  return { success: true }
}
