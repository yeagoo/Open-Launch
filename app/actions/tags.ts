"use server"

import { revalidatePath } from "next/cache"
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
import { and, asc, count, desc, eq, or, sql } from "drizzle-orm"

import { auth } from "@/lib/auth"

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
  const session = await getSession()
  const userId = session?.user?.id || null

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

  const projectsData = await db
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
    .offset(offset)

  // Enrich with user upvote data and categories
  const enrichedProjects = await enrichProjectsWithUserData(projectsData, userId)

  const totalResult = await db
    .select({ count: count(projectTable.id) })
    .from(projectTable)
    .innerJoin(projectToTag, eq(projectTable.id, projectToTag.projectId))
    .where(queryConditions)

  return {
    projects: enrichedProjects,
    totalCount: totalResult[0]?.count || 0,
  }
}

// ─── Authenticated actions ───────────────────────────────────────────────────

export async function upsertTagsForProject(projectId: string, tagNames: string[]) {
  // Verify the caller is authenticated and owns this project
  const session = await getSession()
  if (!session?.user?.id) {
    return { success: false, tagIds: [] }
  }

  // Check project ownership (or admin role)
  if (session.user.role !== "admin") {
    const proj = await db
      .select({ createdBy: projectTable.createdBy })
      .from(projectTable)
      .where(eq(projectTable.id, projectId))
      .limit(1)

    if (!proj[0] || proj[0].createdBy !== session.user.id) {
      return { success: false, tagIds: [] }
    }
  }

  // Limit to 10 tags per project
  const tagsToProcess = tagNames.slice(0, 10)

  // Normalize and filter
  const normalizedTags = tagsToProcess
    .map(normalizeTag)
    .filter((t) => t.slug.length >= 2 && t.slug.length <= 30)

  if (normalizedTags.length === 0) {
    return { success: true, tagIds: [] }
  }

  // Upsert tags
  for (const t of normalizedTags) {
    await db
      .insert(tagTable)
      .values({
        id: t.id,
        name: t.name,
        slug: t.slug,
        moderationStatus: tagModerationStatus.PENDING,
        projectCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoNothing({ target: tagTable.id })
  }

  // Get old tag IDs before deleting associations
  const oldAssociations = await db
    .select({ tagId: projectToTag.tagId })
    .from(projectToTag)
    .where(eq(projectToTag.projectId, projectId))
  const oldTagIds = oldAssociations.map((a) => a.tagId)

  // Delete old tag associations for this project
  await db.delete(projectToTag).where(eq(projectToTag.projectId, projectId))

  // Insert new associations
  await db.insert(projectToTag).values(
    normalizedTags.map((t) => ({
      projectId,
      tagId: t.id,
    })),
  )

  // Collect all affected tag IDs (old + new) for count update
  const newTagIds = normalizedTags.map((t) => t.id)
  const allAffectedTagIds = [...new Set([...oldTagIds, ...newTagIds])]

  // Update project counts for all affected tags
  for (const tagId of allAffectedTagIds) {
    const countResult = await db
      .select({ count: count() })
      .from(projectToTag)
      .where(eq(projectToTag.tagId, tagId))

    await db
      .update(tagTable)
      .set({
        projectCount: countResult[0]?.count || 0,
        updatedAt: new Date(),
      })
      .where(eq(tagTable.id, tagId))
  }

  return { success: true, tagIds: normalizedTags.map((t) => t.id) }
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
  revalidatePath("/admin/tags")
  return { success: true }
}

export async function deleteTag(tagId: string) {
  await checkAdminAccess()

  // Delete cascades through projectToTag via FK
  await db.delete(tagTable).where(eq(tagTable.id, tagId))

  revalidatePath("/tags")
  revalidatePath("/admin/tags")
  return { success: true }
}

// ─── Shared helper (mirrors pattern from projects.ts) ────────────────────────

async function enrichProjectsWithUserData<T extends { id: string }>(
  projects: T[],
  userId: string | null,
) {
  if (!projects.length)
    return projects.map((p) => ({
      ...p,
      userHasUpvoted: false,
      categories: [] as { id: string; name: string }[],
    }))

  const projectIds = projects.map((p) => p.id)

  // Import dynamically to avoid circular deps
  const { projectToCategory, category: categoryTable } = await import("@/drizzle/db/schema")

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
      if (!acc[row.projectId]) acc[row.projectId] = []
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
