"use server"

import { db } from "@/drizzle/db"
import { project, user, category } from "@/drizzle/db/schema"
import { desc, eq, sql } from "drizzle-orm"
import { getLaunchAvailabilityRange } from "./launch"
import { format, addDays } from "date-fns"
import { DATE_FORMAT, LAUNCH_SETTINGS } from "@/lib/constants"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"

// Vérification des droits admin
async function checkAdminAccess() {
  const session = await auth.api.getSession({
    headers: await headers()
  })
  if (!session?.user?.role || session.user.role !== "admin") {
    throw new Error("Unauthorized: Admin access required")
  }
}

// Get all users and launch stats
export async function getAdminStatsAndUsers() {
  await checkAdminAccess()
  
  // Get all users, sorted by registration date descending
  const users = await db.select().from(user).orderBy(desc(user.createdAt))

  // Get launch stats
  const totalLaunches = await db.select({ count: sql`count(*)` }).from(project)
  const premiumLaunches = await db
    .select({ count: sql`count(*)` })
    .from(project)
    .where(eq(project.launchType, "premium"))
  const premiumPlusLaunches = await db
    .select({ count: sql`count(*)` })
    .from(project)
    .where(eq(project.launchType, "premium_plus"))

  return {
    users,
    stats: {
      totalLaunches: Number(totalLaunches[0]?.count || 0),
      premiumLaunches: Number(premiumLaunches[0]?.count || 0),
      premiumPlusLaunches: Number(premiumPlusLaunches[0]?.count || 0),
      totalUsers: users.length,
    },
  }
}

// Get free launch availability
export async function getFreeLaunchAvailability() {
  await checkAdminAccess()
  
  const today = new Date()
  const startDate = format(addDays(today, LAUNCH_SETTINGS.MIN_DAYS_AHEAD), DATE_FORMAT.API)
  const endDate = format(addDays(today, LAUNCH_SETTINGS.MAX_DAYS_AHEAD), DATE_FORMAT.API)

  const availability = await getLaunchAvailabilityRange(startDate, endDate, "free")
  
  // Find the first available date
  const firstAvailableDate = availability.find(date => date.freeSlots > 0)
  
  return {
    availability,
    firstAvailableDate: firstAvailableDate ? {
      date: firstAvailableDate.date,
      freeSlots: firstAvailableDate.freeSlots
    } : null
  }
}

// Get all categories
export async function getCategories() {
  await checkAdminAccess()
  
  const categories = await db.select({
    name: category.name,
  })
  .from(category)
  .orderBy(category.name)

  const totalCount = await db.select({ count: sql<number>`count(*)::int` }).from(category)

  return {
    categories,
    totalCount: totalCount[0]?.count || 0
  }
}

// Add a new category
export async function addCategory(name: string) {
  await checkAdminAccess()
  
  // Name validation
  const trimmedName = name.trim()
  if (!trimmedName) {
    return { success: false, error: 'Category name cannot be empty' }
  }
  if (trimmedName.length < 2) {
    return { success: false, error: 'Category name must be at least 2 characters long' }
  }
  if (trimmedName.length > 50) {
    return { success: false, error: 'Category name cannot exceed 50 characters' }
  }

  try {
    // Check if category already exists
    const existingCategory = await db.select()
      .from(category)
      .where(eq(category.name, trimmedName))
      .limit(1)

    if (existingCategory.length > 0) {
      return { success: false, error: 'This category already exists' }
    }

    const id = trimmedName.toLowerCase().replace(/\s+/g, '-')
    
    await db.insert(category).values({
      id,
      name: trimmedName,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    return { success: true }
  } catch (error) {
    console.error('Error adding category:', error)
    if (error instanceof Error && error.message.includes('unique constraint')) {
      return { success: false, error: 'This category already exists' }
    }
    return { success: false, error: 'An error occurred while adding the category' }
  }
} 