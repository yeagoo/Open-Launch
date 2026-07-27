"use server"

import { revalidatePath } from "next/cache"
import { headers } from "next/headers"

import { db } from "@/drizzle/db"
import { bookmark, project as projectTable } from "@/drizzle/db/schema"
import { and, desc, eq, sql } from "drizzle-orm"

import { auth } from "@/lib/auth"
import { checkRateLimit } from "@/lib/rate-limit"

// Per-user toggle budget. Fail closed: bookmarks are cheap but the toggle
// writes rows, and a limiter outage shouldn't multiply limits per instance.
const BOOKMARK_LIMITS = {
  ACTIONS_PER_WINDOW: 60,
  TIME_WINDOW_MS: 5 * 60 * 1000,
} as const

async function getSession() {
  return auth.api.getSession({ headers: await headers() })
}

export interface ToggleBookmarkResult {
  success: boolean
  bookmarked?: boolean
  message?: string
}

/**
 * Toggle a bookmark. Atomic like toggleUpvote: the check and the write are
 * serialized per (user, project) with a transaction-scoped advisory lock,
 * so concurrent double-clicks can't end in an inverted state. The
 * (user_id, project_id) unique index is the last-resort integrity net.
 */
export async function toggleBookmark(projectId: string): Promise<ToggleBookmarkResult> {
  const session = await getSession()
  if (!session?.user?.id) {
    return { success: false, message: "Authentication required" }
  }

  const { success: withinLimit } = await checkRateLimit(
    `bookmark:${session.user.id}`,
    BOOKMARK_LIMITS.ACTIONS_PER_WINDOW,
    BOOKMARK_LIMITS.TIME_WINDOW_MS,
    { onRedisError: "fail-closed" },
  )
  if (!withinLimit) {
    return { success: false, message: "Too many actions. Please try again later." }
  }

  // Only visibly-launched projects can be bookmarked — a payment_pending
  // draft must not collect public engagement.
  const [proj] = await db
    .select({ launchStatus: projectTable.launchStatus })
    .from(projectTable)
    .where(eq(projectTable.id, projectId))
    .limit(1)
  if (!proj) {
    return { success: false, message: "Project not found" }
  }
  if (proj.launchStatus !== "ongoing" && proj.launchStatus !== "launched") {
    return { success: false, message: "This project cannot be bookmarked" }
  }

  let bookmarked = false
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${session.user.id} || ':' || ${projectId}))`,
    )
    const existing = await tx
      .select({ id: bookmark.id })
      .from(bookmark)
      .where(and(eq(bookmark.userId, session.user.id), eq(bookmark.projectId, projectId)))
      .limit(1)

    if (existing.length > 0) {
      await tx
        .delete(bookmark)
        .where(and(eq(bookmark.userId, session.user.id), eq(bookmark.projectId, projectId)))
      bookmarked = false
    } else {
      await tx
        .insert(bookmark)
        .values({
          id: crypto.randomUUID(),
          userId: session.user.id,
          projectId,
          createdAt: new Date(),
        })
        .onConflictDoNothing()
      bookmarked = true
    }
  })

  revalidatePath("/dashboard")
  return { success: true, bookmarked }
}

export async function hasUserBookmarked(projectId: string): Promise<boolean> {
  const session = await getSession()
  if (!session?.user?.id) return false

  const rows = await db
    .select({ id: bookmark.id })
    .from(bookmark)
    .where(and(eq(bookmark.userId, session.user.id), eq(bookmark.projectId, projectId)))
    .limit(1)
  return rows.length > 0
}

export async function getUserBookmarkedProjects() {
  const session = await getSession()
  if (!session?.user?.id) return []

  // Explicit field list (never the full project row): server-action
  // results are serialized to the browser, and project carries internal
  // columns (premiumPriceCents, crawl/moderation internals).
  return (
    db
      .select({
        project: {
          id: projectTable.id,
          name: projectTable.name,
          slug: projectTable.slug,
          logoUrl: projectTable.logoUrl,
          description: projectTable.description,
          launchStatus: projectTable.launchStatus,
          launchType: projectTable.launchType,
          scheduledLaunchDate: projectTable.scheduledLaunchDate,
          websiteUrl: projectTable.websiteUrl,
          createdAt: projectTable.createdAt,
          dailyRanking: projectTable.dailyRanking,
        },
        bookmarkedAt: bookmark.createdAt,
      })
      .from(bookmark)
      .innerJoin(projectTable, eq(bookmark.projectId, projectTable.id))
      .where(eq(bookmark.userId, session.user.id))
      .orderBy(desc(bookmark.createdAt))
      // Generous cap: the dashboard tab has no pagination, so anything
      // smaller silently strands older saves.
      .limit(500)
  )
}
