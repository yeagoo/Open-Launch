"use server"

import { cache } from "react"
import { revalidatePath } from "next/cache"
import { headers } from "next/headers"

import { db } from "@/drizzle/db"
import {
  category,
  fumaComments,
  launchStatus,
  project,
  projectToCategory,
  projectToTag,
  projectTranslation,
  tagModerationStatus,
  tag as tagTable,
  upvote,
  user,
} from "@/drizzle/db/schema"
import { and, eq, ne, sql } from "drizzle-orm"

import { auth } from "@/lib/auth"
import { sanitizeRichText } from "@/lib/sanitize"
import { getCurrentUserId } from "@/lib/server-auth"
import { projectUpdateSchema, type ProjectUpdateInput } from "@/lib/validations/project"

// Get session helper
async function getSession() {
  return auth.api.getSession({
    headers: await headers(),
  })
}

/**
 * Get project by slug — wrapped in React `cache()` so that within
 * a single request, `generateMetadata` and the page body share one
 * lookup. Without this the detail page issued 8 DB queries per
 * render (4 inside this function, called twice).
 *
 * `cache()` is per-request so two different visitors still trigger
 * two real DB reads — for cross-request caching see `unstable_cache`
 * in the actions called from the home page.
 */
export const getProjectBySlug = cache(async (slug: string) => {
  // Get project details - Exclure les projets avec le statut payment_pending
  const [projectData] = await db
    .select()
    .from(project)
    .where(and(eq(project.slug, slug), ne(project.launchStatus, launchStatus.PAYMENT_PENDING)))
    .limit(1)

  if (!projectData) {
    return null
  }

  // Get creator information if available
  let creator = null
  if (projectData.createdBy) {
    const [creatorData] = await db
      .select()
      .from(user)
      .where(eq(user.id, projectData.createdBy))
      .limit(1)
    creator = creatorData
  }

  // Get categories
  const categories = await db
    .select({
      id: category.id,
      name: category.name,
    })
    .from(category)
    .innerJoin(projectToCategory, eq(category.id, projectToCategory.categoryId))
    .where(eq(projectToCategory.projectId, projectData.id))

  // Get upvote count
  const [upvoteCount] = await db
    .select({
      count: sql`count(*)`,
    })
    .from(upvote)
    .where(eq(upvote.projectId, projectData.id))

  // Get comment count — fumaComments.page is the project id (see
  // fuma-comment integration in lib/comment.config.ts). Used by the
  // structured-data interactionStatistic on the detail page.
  const [commentCount] = await db
    .select({
      count: sql`count(*)`,
    })
    .from(fumaComments)
    .where(sql`${fumaComments.page}::text = ${projectData.id}`)

  return {
    ...projectData,
    categories,
    upvoteCount: Number(upvoteCount?.count || 0),
    commentCount: Number(commentCount?.count || 0),
    creator,
  }
})

// Check if a user has upvoted a project.
//
// Uses `getCurrentUserId` (React-cached per request) so detail-page
// renders that already resolved the user share the lookup instead of
// hitting auth again.
export async function hasUserUpvoted(projectId: string) {
  const userId = await getCurrentUserId()
  if (!userId) return false

  const userUpvotes = await db
    .select()
    .from(upvote)
    .where(and(eq(upvote.userId, userId), eq(upvote.projectId, projectId)))
    .limit(1)

  return userUpvotes.length > 0
}

/**
 * Server action used by the Edit dialog to load a full editable
 * snapshot (project columns + categories + source-locale tagline).
 * Returns null if the project doesn't exist or the caller isn't the
 * creator. The caller still gets a permission error on save if the
 * status flips out of EDITABLE_STATUSES between page load and submit.
 */
export async function getProjectForEdit(projectId: string) {
  const session = await getSession()
  if (!session?.user?.id) return null

  const [projectData] = await db.select().from(project).where(eq(project.id, projectId)).limit(1)
  if (!projectData || projectData.createdBy !== session.user.id) return null

  const cats = await db
    .select({ id: category.id, name: category.name })
    .from(category)
    .innerJoin(projectToCategory, eq(category.id, projectToCategory.categoryId))
    .where(eq(projectToCategory.projectId, projectId))

  const [taglineRow] = await db
    .select({ tagline: projectTranslation.tagline })
    .from(projectTranslation)
    .where(
      and(
        eq(projectTranslation.projectId, projectId),
        eq(projectTranslation.locale, projectData.sourceLocale),
      ),
    )
    .limit(1)

  return {
    ...projectData,
    tagline: taglineRow?.tagline ?? null,
    categories: cats,
  }
}

// Statuses where the maker can still edit. ongoing/launched are
// publicly visible and out of scope; payment_pending/failed are stuck
// pre-launch states where the user needs editing to unblock themselves.
const EDITABLE_STATUSES = new Set([
  launchStatus.PAYMENT_PENDING,
  launchStatus.PAYMENT_FAILED,
  launchStatus.SCHEDULED,
])

function normalizeProjectTag(raw: string) {
  const name = raw.trim()
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return { id: slug, name, slug }
}

export type UpdateProjectData = ProjectUpdateInput

/**
 * Update an editable project. Allowed for the creator while the
 * project is in payment_pending / payment_failed / scheduled status.
 *
 * Description / tagline edits cascade an AI invalidation: source-locale
 * row gets the new copy, all AI-generated translation rows are deleted
 * so the translate-projects cron re-fans-out, and EN long_description
 * is cleared so enrich-projects regenerates it. Other fields (name,
 * urls, logo, categories, tags, etc.) update in place without
 * re-running AI workloads — they don't change the canonical text the
 * AI was working from.
 *
 * Slug is intentionally never recomputed when name changes — old URLs
 * keep working.
 */
export async function updateProject(projectId: string, data: UpdateProjectData) {
  const session = await getSession()

  if (!session?.user?.id) {
    return { success: false, error: "Authentication required" }
  }

  try {
    const parsedUpdate = projectUpdateSchema.safeParse(data)
    if (!parsedUpdate.success) {
      return {
        success: false,
        error: "Invalid project data",
        issues: parsedUpdate.error.flatten().fieldErrors,
      }
    }
    data = parsedUpdate.data

    const [projectData] = await db.select().from(project).where(eq(project.id, projectId)).limit(1)

    if (!projectData) {
      return { success: false, error: "Project not found" }
    }
    if (projectData.createdBy !== session.user.id) {
      return { success: false, error: "You don't have permission to edit this project" }
    }
    if (!EDITABLE_STATUSES.has(projectData.launchStatus as never)) {
      return {
        success: false,
        error: "You can only edit projects that are pre-launch (scheduled / pending / failed)",
      }
    }

    // Sanitize / normalize incoming fields once so the diff logic below is
    // simpler. `undefined` means "field not in payload, leave as-is";
    // `null` means "explicit clear" for nullable fields.
    const updates: Partial<typeof project.$inferInsert> = { updatedAt: new Date() }
    let descriptionChanged = false
    let taglineChanged = false
    let sanitizedDescription: string | null = null
    let normalizedWebsiteUrl: string | null = null

    if (typeof data.name === "string") {
      const trimmed = data.name.trim()
      if (trimmed) updates.name = trimmed
    }

    if (typeof data.description === "string") {
      sanitizedDescription = sanitizeRichText(data.description)
      const [currentSourceRow] = await db
        .select({ description: projectTranslation.description })
        .from(projectTranslation)
        .where(
          and(
            eq(projectTranslation.projectId, projectId),
            eq(projectTranslation.locale, projectData.sourceLocale),
          ),
        )
        .limit(1)
      descriptionChanged = currentSourceRow?.description !== sanitizedDescription
      updates.description = sanitizedDescription
      if (descriptionChanged) {
        // Same reasoning as before: clear the quality verdict so the
        // cron re-classifies the new copy.
        updates.qualityCheckedAt = null
      }
    }

    if ("tagline" in data) {
      const next = typeof data.tagline === "string" ? data.tagline.trim().slice(0, 60) : null
      const [currentSourceRow] = await db
        .select({ tagline: projectTranslation.tagline })
        .from(projectTranslation)
        .where(
          and(
            eq(projectTranslation.projectId, projectId),
            eq(projectTranslation.locale, projectData.sourceLocale),
          ),
        )
        .limit(1)
      taglineChanged = (currentSourceRow?.tagline ?? null) !== (next || null)
    }

    if (typeof data.websiteUrl === "string") {
      normalizedWebsiteUrl = data.websiteUrl.toLowerCase().trim().replace(/\/$/, "")
      if (normalizedWebsiteUrl !== projectData.websiteUrl) {
        // Uniqueness check — same rule as submitProject. If another
        // active project already owns this URL, refuse.
        const [conflict] = await db
          .select({ id: project.id })
          .from(project)
          .where(and(eq(project.websiteUrl, normalizedWebsiteUrl), ne(project.id, projectId)))
          .limit(1)
        if (conflict) {
          return { success: false, error: "This website URL is already used by another project" }
        }
        updates.websiteUrl = normalizedWebsiteUrl
        // Changing the URL invalidates the previous badge verification —
        // the badge lives on the old domain, not the new one.
        updates.hasBadgeVerified = false
      }
    }

    if (typeof data.logoUrl === "string" && data.logoUrl) updates.logoUrl = data.logoUrl
    if ("productImage" in data) updates.productImage = data.productImage ?? null
    if (Array.isArray(data.techStack)) updates.techStack = data.techStack.slice(0, 10)
    if (Array.isArray(data.platforms)) updates.platforms = data.platforms
    if (typeof data.pricing === "string") updates.pricing = data.pricing
    if ("githubUrl" in data) updates.githubUrl = data.githubUrl ?? null
    if ("twitterUrl" in data) updates.twitterUrl = data.twitterUrl ?? null

    await db.transaction(async (tx) => {
      await tx.update(project).set(updates).where(eq(project.id, projectId))

      if (Array.isArray(data.categories)) {
        await tx.delete(projectToCategory).where(eq(projectToCategory.projectId, projectId))
        if (data.categories.length > 0) {
          await tx.insert(projectToCategory).values(
            data.categories.map((categoryId) => ({
              projectId,
              categoryId,
            })),
          )
        }
      }

      if (Array.isArray(data.techStack)) {
        const normalizedTags = [
          ...new Map(
            data.techStack
              .map(normalizeProjectTag)
              .filter((tag) => tag.slug.length >= 2 && tag.slug.length <= 30)
              .map((tag) => [tag.id, tag]),
          ).values(),
        ]
        const oldRows = await tx
          .select({ tagId: projectToTag.tagId })
          .from(projectToTag)
          .where(eq(projectToTag.projectId, projectId))

        for (const tag of normalizedTags) {
          await tx
            .insert(tagTable)
            .values({
              id: tag.id,
              name: tag.name,
              slug: tag.slug,
              moderationStatus: tagModerationStatus.PENDING,
              projectCount: 0,
              createdAt: new Date(),
              updatedAt: new Date(),
            })
            .onConflictDoNothing({ target: tagTable.id })
        }

        await tx.delete(projectToTag).where(eq(projectToTag.projectId, projectId))
        if (normalizedTags.length > 0) {
          await tx
            .insert(projectToTag)
            .values(normalizedTags.map((tag) => ({ projectId, tagId: tag.id })))
        }

        const affectedTagIds = [
          ...new Set([...oldRows.map((row) => row.tagId), ...normalizedTags.map((tag) => tag.id)]),
        ]
        for (const tagId of affectedTagIds) {
          await tx
            .update(tagTable)
            .set({
              projectCount: sql`(SELECT count(*) FROM ${projectToTag} WHERE ${projectToTag.tagId} = ${tagTable.id})`,
              updatedAt: new Date(),
            })
            .where(eq(tagTable.id, tagId))
        }
      }

      if (descriptionChanged && sanitizedDescription !== null) {
        // Refresh the source-locale row + clear its long_description so
        // enrich-projects regenerates the AI overview.
        await tx
          .insert(projectTranslation)
          .values({
            projectId,
            locale: projectData.sourceLocale,
            description: sanitizedDescription,
            isSource: true,
            aiGenerated: false,
          })
          .onConflictDoUpdate({
            target: [projectTranslation.projectId, projectTranslation.locale],
            set: {
              description: sanitizedDescription,
              isSource: true,
              aiGenerated: false,
              updatedAt: new Date(),
              longDescription: null,
              longDescriptionGeneratedAt: null,
            },
          })

        if (projectData.sourceLocale !== "en") {
          await tx
            .update(projectTranslation)
            .set({ longDescription: null, longDescriptionGeneratedAt: null })
            .where(
              and(eq(projectTranslation.projectId, projectId), eq(projectTranslation.locale, "en")),
            )
        }

        // Drop AI-generated translation rows so cron re-translates from
        // the new source. (Deleting also drops their long_description.)
        await tx
          .delete(projectTranslation)
          .where(
            and(
              eq(projectTranslation.projectId, projectId),
              eq(projectTranslation.aiGenerated, true),
            ),
          )
      }

      if (taglineChanged) {
        const nextTagline =
          typeof data.tagline === "string" ? data.tagline.trim().slice(0, 60) || null : null
        // The source-locale translation row is guaranteed to exist
        // (created in submitProject), so a plain UPDATE is enough — no
        // need for an UPSERT path that would have to invent a
        // description value when the row is missing.
        await tx
          .update(projectTranslation)
          .set({
            tagline: nextTagline,
            taglineGeneratedAt: nextTagline ? new Date() : null,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(projectTranslation.projectId, projectId),
              eq(projectTranslation.locale, projectData.sourceLocale),
            ),
          )

        // Clear stale AI-translated taglines on non-source rows so the
        // translate-projects cron re-fans-out from the new source.
        // Skipped when description also changed: that branch already
        // deleted every aiGenerated row above, so there's nothing left
        // to clear here.
        if (!descriptionChanged) {
          await tx
            .update(projectTranslation)
            .set({ tagline: null, taglineGeneratedAt: null })
            .where(
              and(
                eq(projectTranslation.projectId, projectId),
                ne(projectTranslation.locale, projectData.sourceLocale),
              ),
            )
        }
      }
    })

    revalidatePath(`/projects/${projectData.slug}`)
    revalidatePath("/dashboard")

    return { success: true, message: "Project updated successfully" }
  } catch (error) {
    console.error("Error updating project:", error)
    return { success: false, error: "Failed to update project" }
  }
}
