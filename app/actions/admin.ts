"use server"

import { revalidateTag } from "next/cache"

import { db } from "@/drizzle/db"
import { category, project, user } from "@/drizzle/db/schema"
import { addDays, format } from "date-fns"
import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm"

import { queryAdminUsersPage } from "@/lib/admin-user-pagination"
import { TOP_CATEGORIES_TAG } from "@/lib/cache-tags"
import { DATE_FORMAT, LAUNCH_SETTINGS } from "@/lib/constants"
import { countInt } from "@/lib/db-utils"
import { logger } from "@/lib/observability/structured-logger"
import { requireAdmin } from "@/lib/server-auth"

import { getLaunchAvailabilityRange } from "./launch"

export async function getAdminUsersPage(input: unknown) {
  await requireAdmin()
  return queryAdminUsersPage(db, input)
}

export async function getAdminOverview() {
  await requireAdmin()
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)

  const [[userStats], [projectStats], roleRows] = await Promise.all([
    db
      .select({
        totalUsers: countInt(),
        newUsersToday: countInt(gte(user.createdAt, today)),
      })
      .from(user),
    db
      .select({
        totalLaunches: countInt(),
        premiumLaunches: countInt(eq(project.launchType, "premium")),
        premiumPlusLaunches: countInt(eq(project.launchType, "premium_plus")),
        newLaunchesToday: countInt(gte(project.createdAt, today)),
        newPremiumLaunchesToday: countInt(
          and(gte(project.createdAt, today), eq(project.launchType, "premium")),
        ),
        newPremiumPlusLaunchesToday: countInt(
          and(gte(project.createdAt, today), eq(project.launchType, "premium_plus")),
        ),
      })
      .from(project),
    db.selectDistinct({ role: user.role }).from(user).orderBy(asc(user.role)),
  ])

  return {
    stats: {
      totalLaunches: projectStats?.totalLaunches ?? 0,
      premiumLaunches: projectStats?.premiumLaunches ?? 0,
      premiumPlusLaunches: projectStats?.premiumPlusLaunches ?? 0,
      totalUsers: userStats?.totalUsers ?? 0,
      newUsersToday: userStats?.newUsersToday ?? 0,
      newLaunchesToday: projectStats?.newLaunchesToday ?? 0,
      newPremiumLaunchesToday: projectStats?.newPremiumLaunchesToday ?? 0,
      newPremiumPlusLaunchesToday: projectStats?.newPremiumPlusLaunchesToday ?? 0,
    },
    roles: [...new Set(roleRows.map(({ role }) => role || "user"))].sort(),
  }
}

// Get free launch availability
export async function getFreeLaunchAvailability() {
  await requireAdmin()

  const today = new Date()
  const startDate = format(addDays(today, LAUNCH_SETTINGS.MIN_DAYS_AHEAD), DATE_FORMAT.API)
  const endDate = format(addDays(today, LAUNCH_SETTINGS.MAX_DAYS_AHEAD), DATE_FORMAT.API)

  const availability = await getLaunchAvailabilityRange(startDate, endDate, "free")

  // Find the first available date
  const firstAvailableDate = availability.find((date) => date.freeSlots > 0)

  return {
    availability,
    firstAvailableDate: firstAvailableDate
      ? {
          date: firstAvailableDate.date,
          freeSlots: firstAvailableDate.freeSlots,
        }
      : null,
  }
}

// Get all categories
export async function getCategories() {
  await requireAdmin()

  const categories = await db
    .select({
      name: category.name,
    })
    .from(category)
    .orderBy(category.name)

  const totalCount = await db.select({ count: countInt() }).from(category)

  return {
    categories,
    totalCount: totalCount[0]?.count || 0,
  }
}

// Add a new category
export async function addCategory(name: string) {
  await requireAdmin()

  // Name validation
  const trimmedName = name.trim()
  if (!trimmedName) {
    return { success: false, error: "Category name cannot be empty" }
  }
  if (trimmedName.length < 2) {
    return { success: false, error: "Category name must be at least 2 characters long" }
  }
  if (trimmedName.length > 50) {
    return { success: false, error: "Category name cannot exceed 50 characters" }
  }

  try {
    // Check if category already exists
    const existingCategory = await db
      .select()
      .from(category)
      .where(eq(category.name, trimmedName))
      .limit(1)

    if (existingCategory.length > 0) {
      return { success: false, error: "This category already exists" }
    }

    const id = trimmedName.toLowerCase().replace(/\s+/g, "-")

    await db.insert(category).values({
      id,
      name: trimmedName,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    // Home sidebar top-categories cache (1h TTL) — reflect the new
    // category immediately.
    revalidateTag(TOP_CATEGORIES_TAG, "max")
    return { success: true }
  } catch (error) {
    logger.error("admin_category_create_failed", { error })
    if (error instanceof Error && error.message.includes("unique constraint")) {
      return { success: false, error: "This category already exists" }
    }
    return { success: false, error: "An error occurred while adding the category" }
  }
}

// Get scheduled projects grouped by launch date
export async function getScheduledProjects(daysAhead: number = 7) {
  await requireAdmin()

  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)

  const endDate = addDays(today, daysAhead)
  endDate.setUTCHours(23, 59, 59, 999)

  // Get all scheduled projects within the date range
  const scheduledProjects = await db
    .select({
      id: project.id,
      name: project.name,
      slug: project.slug,
      launchType: project.launchType,
      scheduledLaunchDate: project.scheduledLaunchDate,
      hasBadgeVerified: project.hasBadgeVerified,
      createdAt: project.createdAt,
      createdBy: project.createdBy,
      userName: user.name,
      userEmail: user.email,
    })
    .from(project)
    .leftJoin(user, eq(project.createdBy, user.id))
    .where(
      and(
        eq(project.launchStatus, "scheduled"),
        gte(project.scheduledLaunchDate, today),
        lte(project.scheduledLaunchDate, endDate),
      ),
    )
    .orderBy(asc(project.scheduledLaunchDate), desc(project.createdAt))

  // Group by date
  const grouped = scheduledProjects.reduce(
    (acc, proj) => {
      if (!proj.scheduledLaunchDate) return acc
      const dateKey = format(proj.scheduledLaunchDate, "yyyy-MM-dd")
      if (!acc[dateKey]) {
        acc[dateKey] = []
      }
      acc[dateKey].push(proj)
      return acc
    },
    {} as Record<string, typeof scheduledProjects>,
  )

  return {
    projects: scheduledProjects,
    groupedByDate: grouped,
    total: scheduledProjects.length,
  }
}

// Delete a project
export async function deleteProject(projectId: string) {
  await requireAdmin()

  try {
    await db.delete(project).where(eq(project.id, projectId))
    return { success: true }
  } catch (error) {
    logger.error("admin_project_delete_failed", {
      error,
      context: { projectId },
    })
    return { success: false, error: "Failed to delete project" }
  }
}

// Get all paid projects (premium and premium_plus)
export async function getPaidProjects() {
  await requireAdmin()

  const paidProjects = await db
    .select({
      id: project.id,
      name: project.name,
      slug: project.slug,
      websiteUrl: project.websiteUrl,
      logoUrl: project.logoUrl,
      launchType: project.launchType,
      launchStatus: project.launchStatus,
      scheduledLaunchDate: project.scheduledLaunchDate,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
    })
    .from(project)
    .leftJoin(user, eq(project.createdBy, user.id))
    .where(inArray(project.launchType, ["premium", "premium_plus"]))
    .orderBy(desc(project.updatedAt))

  // Get statistics
  const stats = {
    total: paidProjects.length,
    premium: paidProjects.filter((p) => p.launchType === "premium").length,
    premiumPlus: paidProjects.filter((p) => p.launchType === "premium_plus").length,
    scheduled: paidProjects.filter((p) => p.launchStatus === "scheduled").length,
    launched: paidProjects.filter((p) => p.launchStatus === "launched").length,
    ongoing: paidProjects.filter((p) => p.launchStatus === "ongoing").length,
  }

  return {
    projects: paidProjects,
    stats,
  }
}

/**
 * Badge Fast Track projects — `launch_type = 'free_with_badge'`.
 * Used by /admin/badge-projects to track which projects skipped the
 * queue via the badge install (free path) so admin can audit:
 *   - that the badge is actually still present on their site
 *   - usage volume vs paid Directory tiers
 */
export async function getBadgeProjects() {
  await requireAdmin()

  const rows = await db
    .select({
      id: project.id,
      name: project.name,
      slug: project.slug,
      websiteUrl: project.websiteUrl,
      logoUrl: project.logoUrl,
      launchType: project.launchType,
      launchStatus: project.launchStatus,
      scheduledLaunchDate: project.scheduledLaunchDate,
      hasBadgeVerified: project.hasBadgeVerified,
      badgeVerifiedAt: project.badgeVerifiedAt,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
    })
    .from(project)
    .leftJoin(user, eq(project.createdBy, user.id))
    .where(eq(project.launchType, "free_with_badge"))
    .orderBy(desc(project.scheduledLaunchDate), desc(project.updatedAt))

  const stats = {
    total: rows.length,
    scheduled: rows.filter((p) => p.launchStatus === "scheduled").length,
    launched: rows.filter((p) => p.launchStatus === "launched").length,
    ongoing: rows.filter((p) => p.launchStatus === "ongoing").length,
  }

  return { projects: rows, stats }
}
