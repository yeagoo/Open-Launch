/**
 * Public user profile queries.
 *
 * Two hard rules:
 *  - SELECT WHITELIST: only id/name/image/createdAt. Never email, role,
 *    stripeCustomerId, ban internals — this data renders on a public page.
 *  - SHARED VISIBILITY PREDICATE: the profile page, the sitemap shard and
 *    the launches list all use `PUBLIC_PROFILE_PROJECT_WHERE` — a user is
 *    only publicly visible when they have at least one ongoing/launched,
 *    non-low-quality project. Scheduled / payment_pending projects (and
 *    their owners) stay private.
 */

import { cache } from "react"

import { db } from "@/drizzle/db"
import { launchStatus, project, user } from "@/drizzle/db/schema"
import { and, countDistinct, desc, eq, isNull, or, type SQL } from "drizzle-orm"

export const PUBLIC_PROFILE_PROJECT_WHERE: SQL = and(
  or(
    eq(project.launchStatus, launchStatus.ONGOING),
    eq(project.launchStatus, launchStatus.LAUNCHED),
  ),
  eq(project.isLowQuality, false),
)!

export interface PublicUserProfile {
  id: string
  name: string | null
  image: string | null
  createdAt: Date
}

export interface PublicUserProject {
  id: string
  name: string
  slug: string
  logoUrl: string | null
  launchStatus: string
  dailyRanking: number | null
  scheduledLaunchDate: Date | null
}

/**
 * Returns null when the user doesn't exist, is banned, or has no publicly
 * visible project — the profile page 404s in all three cases.
 */
// React cache(): generateMetadata and the page both call this per
// request — dedupe to one DB round-trip per (request, userId).
export const getPublicUserProfile = cache(
  async (
    userId: string,
  ): Promise<{
    profile: PublicUserProfile
    projects: PublicUserProject[]
  } | null> => {
    const [row] = await db
      .select({
        id: user.id,
        name: user.name,
        image: user.image,
        createdAt: user.createdAt,
        banned: user.banned,
        isBot: user.isBot,
      })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1)

    if (!row || row.banned === true || row.isBot === true) return null

    // Legacy base64 avatars must never render inline on a public page —
    // a data: URL here would ship the full payload with every request.
    const safeImage = row.image && !row.image.startsWith("data:") ? row.image : null

    const projects = await db
      .select({
        id: project.id,
        name: project.name,
        slug: project.slug,
        logoUrl: project.logoUrl,
        launchStatus: project.launchStatus,
        dailyRanking: project.dailyRanking,
        scheduledLaunchDate: project.scheduledLaunchDate,
      })
      .from(project)
      .where(and(eq(project.createdBy, userId), PUBLIC_PROFILE_PROJECT_WHERE))
      .orderBy(desc(project.scheduledLaunchDate))
      .limit(50)

    if (projects.length === 0) return null

    return {
      profile: { id: row.id, name: row.name, image: safeImage, createdAt: row.createdAt },
      projects,
    }
  },
)

/**
 * Cheap existence check used to gate profile LINKS (e.g. the maker card)
 * so they never point at a 404.
 */
export async function hasPublicProfile(userId: string): Promise<boolean> {
  const rows = await db
    .select({ id: project.id })
    .from(project)
    .innerJoin(user, eq(user.id, project.createdBy))
    .where(
      and(
        eq(project.createdBy, userId),
        or(eq(user.banned, false), isNull(user.banned)),
        or(eq(user.isBot, false), isNull(user.isBot)),
        PUBLIC_PROFILE_PROJECT_WHERE,
      ),
    )
    .limit(1)
  return rows.length > 0
}

const PUBLIC_PROFILE_USER_WHERE: SQL = and(
  or(eq(user.banned, false), isNull(user.banned)),
  // Bots have real-looking projects (ProductHunt imports) but the page
  // 404s them — don't submit dead URLs to search engines.
  or(eq(user.isBot, false), isNull(user.isBot)),
  PUBLIC_PROFILE_PROJECT_WHERE,
)!

/** Count users eligible for the sitemap index (same predicate as the page). */
export async function countPublicProfileUsers(): Promise<number> {
  const [row] = await db
    .select({ count: countDistinct(user.id) })
    .from(user)
    .innerJoin(project, eq(project.createdBy, user.id))
    .where(PUBLIC_PROFILE_USER_WHERE)
  return row?.count ?? 0
}

/**
 * One deterministic page of user ids eligible for a sitemap shard.
 * Callers clamp limit/offset before reaching this shared query.
 */
export async function listPublicProfileUserIds({
  limit,
  offset,
}: {
  limit: number
  offset: number
}): Promise<string[]> {
  const rows = await db
    .selectDistinct({ id: user.id })
    .from(user)
    .innerJoin(project, eq(project.createdBy, user.id))
    .orderBy(user.id)
    .where(PUBLIC_PROFILE_USER_WHERE)
    .limit(limit)
    .offset(offset)
  return rows.map((r) => r.id)
}
