"use server"

import { revalidatePath } from "next/cache"

import { db } from "@/drizzle/db"
import {
  category,
  launchQuota,
  launchStatus,
  launchType,
  project,
  projectToCategory,
  projectToTag,
  projectTranslation,
  tagModerationStatus,
  tag as tagTable,
} from "@/drizzle/db/schema"
import { and, eq, gte, inArray, lt, ne, sql } from "drizzle-orm"

import { countInt } from "@/lib/db-utils"
import { shouldReleaseBadgeFastTrack } from "@/lib/project-edit-guards"
import { sanitizeRichText } from "@/lib/sanitize"
import { getServerSession } from "@/lib/server-auth"
import { projectUpdateSchema, type ProjectUpdateInput } from "@/lib/validations/project"

/**
 * Server action used by the Edit dialog to load a full editable
 * snapshot (project columns + categories + source-locale tagline).
 * Returns null if the project doesn't exist or the caller isn't the
 * creator. The caller still gets a permission error on save if the
 * status flips out of EDITABLE_STATUSES between page load and submit.
 */
export async function getProjectForEdit(projectId: string) {
  const session = await getServerSession()
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
const EDITABLE_STATUS_VALUES = [
  launchStatus.PAYMENT_PENDING,
  launchStatus.PAYMENT_FAILED,
  launchStatus.SCHEDULED,
] as const
const EDITABLE_STATUSES = new Set<string>(EDITABLE_STATUS_VALUES)

class ProjectEditGuardError extends Error {}

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
  const session = await getServerSession()

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
    }

    if (typeof data.logoUrl === "string" && data.logoUrl) updates.logoUrl = data.logoUrl
    if ("productImage" in data) updates.productImage = data.productImage ?? null
    if (Array.isArray(data.techStack)) updates.techStack = data.techStack.slice(0, 10)
    if (Array.isArray(data.platforms)) updates.platforms = data.platforms
    if (typeof data.pricing === "string") updates.pricing = data.pricing
    if ("githubUrl" in data) updates.githubUrl = data.githubUrl ?? null
    if ("twitterUrl" in data) updates.twitterUrl = data.twitterUrl ?? null

    let projectSlug = projectData.slug

    await db.transaction(async (tx) => {
      // A launch cron and this edit can race. Lock and re-check the canonical
      // row inside the same transaction that changes text/categories/tags so
      // a project that just went live cannot receive a stale pre-launch edit.
      const [lockedProject] = await tx
        .select()
        .from(project)
        .where(eq(project.id, projectId))
        .for("update")
        .limit(1)
      if (!lockedProject) throw new ProjectEditGuardError("Project not found")
      if (lockedProject.createdBy !== session.user.id) {
        throw new ProjectEditGuardError("You don't have permission to edit this project")
      }
      if (!EDITABLE_STATUSES.has(lockedProject.launchStatus)) {
        throw new ProjectEditGuardError(
          "You can only edit projects that are pre-launch (scheduled / pending / failed)",
        )
      }
      projectSlug = lockedProject.slug

      const websiteUrlChanged =
        normalizedWebsiteUrl !== null && normalizedWebsiteUrl !== lockedProject.websiteUrl
      if (websiteUrlChanged && normalizedWebsiteUrl) {
        // This check and the unique constraint make a friendly collision
        // response likely while still letting Postgres be the final arbiter.
        const [conflict] = await tx
          .select({ id: project.id })
          .from(project)
          .where(and(eq(project.websiteUrl, normalizedWebsiteUrl), ne(project.id, projectId)))
          .limit(1)
        if (conflict) {
          throw new ProjectEditGuardError("This website URL is already used by another project")
        }

        updates.websiteUrl = normalizedWebsiteUrl
        updates.hasBadgeVerified = false
        updates.badgeVerifiedAt = null

        if (
          shouldReleaseBadgeFastTrack({
            websiteUrlChanged,
            launchType: lockedProject.launchType,
            launchStatus: lockedProject.launchStatus,
            scheduledLaunchDate: lockedProject.scheduledLaunchDate,
          })
        ) {
          // A verified badge belongs to the previous domain. Release its
          // fast-track reservation and make the maker schedule the new URL
          // through the normal free queue after verifying again.
          updates.launchType = launchType.FREE
          updates.scheduledLaunchDate = null
          updates.premiumPriceCents = null
          updates.featuredOnHomepage = false
        }
      }

      const updated = await tx
        .update(project)
        .set(updates)
        .where(
          and(
            eq(project.id, projectId),
            eq(project.createdBy, session.user.id),
            inArray(project.launchStatus, EDITABLE_STATUS_VALUES),
          ),
        )
        .returning({ id: project.id })
      if (updated.length === 0) {
        throw new ProjectEditGuardError(
          "You can only edit projects that are pre-launch (scheduled / pending / failed)",
        )
      }

      if (
        shouldReleaseBadgeFastTrack({
          websiteUrlChanged,
          launchType: lockedProject.launchType,
          launchStatus: lockedProject.launchStatus,
          scheduledLaunchDate: lockedProject.scheduledLaunchDate,
        }) &&
        lockedProject.scheduledLaunchDate
      ) {
        // Keep the denormalized counter aligned with the canonical project
        // rows. Lock ordering matches scheduleLaunch: project first, quota
        // second, which avoids an AB-BA deadlock with concurrent scheduling.
        const [quota] = await tx
          .select({ id: launchQuota.id })
          .from(launchQuota)
          .where(eq(launchQuota.date, lockedProject.scheduledLaunchDate))
          .for("update")
          .limit(1)

        if (quota) {
          const dayStart = new Date(
            Date.UTC(
              lockedProject.scheduledLaunchDate.getUTCFullYear(),
              lockedProject.scheduledLaunchDate.getUTCMonth(),
              lockedProject.scheduledLaunchDate.getUTCDate(),
            ),
          )
          const dayEnd = new Date(dayStart)
          dayEnd.setUTCDate(dayEnd.getUTCDate() + 1)
          const [counts] = await tx
            .select({
              freeCount: countInt(sql`${project.launchType} = ${launchType.FREE}`),
              badgeCount: countInt(sql`${project.launchType} = ${launchType.FREE_WITH_BADGE}`),
              premiumCount: countInt(sql`${project.launchType} = ${launchType.PREMIUM}`),
            })
            .from(project)
            .where(
              and(
                gte(project.scheduledLaunchDate, dayStart),
                lt(project.scheduledLaunchDate, dayEnd),
                eq(project.launchStatus, launchStatus.SCHEDULED),
              ),
            )

          await tx
            .update(launchQuota)
            .set({
              freeCount: counts?.freeCount ?? 0,
              badgeCount: counts?.badgeCount ?? 0,
              premiumCount: counts?.premiumCount ?? 0,
              updatedAt: new Date(),
            })
            .where(eq(launchQuota.id, quota.id))
        }
      }

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

        // Touch tag rows in ascending id order — concurrent updates sharing
        // tags would otherwise take the same row locks in different orders
        // and deadlock (AB-BA).
        const orderedTags = [...normalizedTags].sort((a, b) => a.id.localeCompare(b.id))
        for (const tag of orderedTags) {
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
        if (orderedTags.length > 0) {
          await tx
            .insert(projectToTag)
            .values(orderedTags.map((tag) => ({ projectId, tagId: tag.id })))
        }

        const affectedTagIds = [
          ...new Set([...oldRows.map((row) => row.tagId), ...orderedTags.map((tag) => tag.id)]),
        ].sort((a, b) => a.localeCompare(b))
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
            locale: lockedProject.sourceLocale,
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

        if (lockedProject.sourceLocale !== "en") {
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
              eq(projectTranslation.locale, lockedProject.sourceLocale),
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
                ne(projectTranslation.locale, lockedProject.sourceLocale),
              ),
            )
        }
      }
    })

    revalidatePath(`/projects/${projectSlug}`)
    revalidatePath("/dashboard")

    return { success: true, message: "Project updated successfully" }
  } catch (error) {
    if (error instanceof ProjectEditGuardError) {
      return { success: false, error: error.message }
    }
    console.error("Error updating project:", error)
    return { success: false, error: "Failed to update project" }
  }
}
