"use server"

import { revalidatePath } from "next/cache"
import { headers } from "next/headers"

import { db } from "@/drizzle/db"
import {
  category,
  launchStatus,
  project,
  projectToCategory,
  projectTranslation,
  upvote,
  user,
} from "@/drizzle/db/schema"
import { and, eq, ne, sql } from "drizzle-orm"

import { auth } from "@/lib/auth"
import { sanitizeRichText } from "@/lib/sanitize"

// Get session helper
async function getSession() {
  return auth.api.getSession({
    headers: await headers(),
  })
}

// Get project by slug
export async function getProjectBySlug(slug: string) {
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

  // Ne plus récupérer les commentaires ici car ils seront gérés par Fuma Comment

  return {
    ...projectData,
    categories,
    upvoteCount: Number(upvoteCount?.count || 0),
    creator,
    // Ne plus inclure les commentaires dans l'objet retourné
  }
}

// Check if a user has upvoted a project
export async function hasUserUpvoted(projectId: string) {
  const session = await getSession()

  if (!session?.user?.id) {
    return false
  }

  const userUpvotes = await db
    .select()
    .from(upvote)
    .where(and(eq(upvote.userId, session.user.id), eq(upvote.projectId, projectId)))
    .limit(1)

  return userUpvotes.length > 0
}

// Update project description and categories
// Only allowed for project owners and only if project is in "scheduled" status
export async function updateProject(
  projectId: string,
  data: {
    description: string
    categories: string[]
  },
) {
  const session = await getSession()

  if (!session?.user?.id) {
    return { success: false, error: "Authentication required" }
  }

  try {
    // Get project to check ownership and status
    const [projectData] = await db.select().from(project).where(eq(project.id, projectId)).limit(1)

    if (!projectData) {
      return { success: false, error: "Project not found" }
    }

    // Check if user is the owner
    if (projectData.createdBy !== session.user.id) {
      return {
        success: false,
        error: "You don't have permission to edit this project",
      }
    }

    // Check if project is in scheduled status
    if (projectData.launchStatus !== "scheduled") {
      return {
        success: false,
        error: "You can only edit projects that are scheduled for launch",
      }
    }

    // Update description (sanitize untrusted HTML for XSS prevention)
    const sanitized = sanitizeRichText(data.description)
    // Skip the AI invalidation cascade entirely if the sanitized description
    // is byte-equal to what's already on the source row. A maker can re-save
    // an unchanged form (e.g. only categories changed) without forcing a full
    // re-translate + re-enrich on every cron tick.
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
    const descriptionChanged = currentSourceRow?.description !== sanitized

    await db.transaction(async (tx) => {
      const projectUpdates: {
        description: string
        updatedAt: Date
        qualityCheckedAt?: Date | null
      } = { description: sanitized, updatedAt: new Date() }
      if (descriptionChanged) {
        // Description was edited — the previous quality verdict was based on
        // stale copy, so clear the timestamp so quality-check-projects cron
        // re-classifies on its next tick.
        // We deliberately keep `is_low_quality` as-is in the meantime: if
        // the project was previously flagged, leaving it un-flagged for the
        // few minutes until the cron re-runs would let a bad-faith owner
        // briefly grab bot engagement and AI-generated SEO content by
        // submitting an edit. The cron will flip the flag if the new copy
        // genuinely earns a higher score.
        projectUpdates.qualityCheckedAt = null
      }
      await tx.update(project).set(projectUpdates).where(eq(project.id, projectId))

      if (!descriptionChanged) {
        // No-op as far as translations go — keep the existing source row,
        // AI translations, and AI long_description columns intact.
        return
      }

      // Refresh the source-locale translation row. Wipe its long_description
      // too — the AI overview was derived from the old short description, so
      // it's now stale and should be regenerated by the enrich-projects cron.
      await tx
        .insert(projectTranslation)
        .values({
          projectId,
          locale: projectData.sourceLocale,
          description: sanitized,
          isSource: true,
          aiGenerated: false,
        })
        .onConflictDoUpdate({
          target: [projectTranslation.projectId, projectTranslation.locale],
          set: {
            description: sanitized,
            isSource: true,
            aiGenerated: false,
            updatedAt: new Date(),
            longDescription: null,
            longDescriptionGeneratedAt: null,
          },
        })

      // Also clear EN long_description if EN is not the source locale; cron will
      // refill from the regenerated source content.
      if (projectData.sourceLocale !== "en") {
        await tx
          .update(projectTranslation)
          .set({ longDescription: null, longDescriptionGeneratedAt: null })
          .where(
            and(eq(projectTranslation.projectId, projectId), eq(projectTranslation.locale, "en")),
          )
      }

      // Invalidate AI-generated translations so the cron regenerates them.
      // Deleting the row also drops their long_description.
      await tx
        .delete(projectTranslation)
        .where(
          and(
            eq(projectTranslation.projectId, projectId),
            eq(projectTranslation.aiGenerated, true),
          ),
        )
    })

    // Update categories (remove old ones and add new ones)
    // First, delete existing categories
    await db.delete(projectToCategory).where(eq(projectToCategory.projectId, projectId))

    // Then add new categories
    if (data.categories.length > 0) {
      await db.insert(projectToCategory).values(
        data.categories.map((categoryId) => ({
          projectId: projectId,
          categoryId,
        })),
      )
    }

    // Revalidate the project page
    revalidatePath(`/projects/${projectData.slug}`)

    return {
      success: true,
      message: "Project updated successfully",
    }
  } catch (error) {
    console.error("Error updating project:", error)
    return {
      success: false,
      error: "Failed to update project",
    }
  }
}
