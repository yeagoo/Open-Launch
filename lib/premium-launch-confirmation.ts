import { db } from "@/drizzle/db"
import { launchQuota, launchStatus, launchType, project } from "@/drizzle/db/schema"
import { and, eq, gte, lt, sql } from "drizzle-orm"

import { LAUNCH_LIMITS, USER_DAILY_LAUNCH_LIMIT } from "@/lib/constants"
import { countInt } from "@/lib/db-utils"

export type PremiumLaunchConfirmationResult =
  | { status: "scheduled"; projectId: string; slug: string }
  | { status: "already_processed"; projectId: string; slug: string; launchStatus: string }
  | {
      status: "rejected"
      reason: "not_found" | "invalid_project" | "capacity_full" | "user_limit"
    }

interface ConfirmPaidPremiumLaunchOptions {
  /** Directory boost orders may legitimately target an already-launched free project. */
  allowNonPremiumProcessed?: boolean
}

const COMPLETED_LAUNCH_STATUSES = new Set<string>([
  launchStatus.SCHEDULED,
  launchStatus.ONGOING,
  launchStatus.LAUNCHED,
])

export function isCompletedLaunchForConfirmation(input: {
  status: string
  type: string | null
  allowNonPremiumProcessed?: boolean
}): boolean {
  return (
    COMPLETED_LAUNCH_STATUSES.has(input.status) &&
    (input.type === launchType.PREMIUM || input.allowNonPremiumProcessed === true)
  )
}

export function getPremiumCapacityRejection(input: {
  totalCount: number
  userCount: number
}): "capacity_full" | "user_limit" | null {
  if (input.totalCount >= LAUNCH_LIMITS.TOTAL_DAILY_LIMIT) return "capacity_full"
  if (input.userCount >= USER_DAILY_LAUNCH_LIMIT) return "user_limit"
  return null
}

/**
 * Atomically confirms a paid Premium launch.
 *
 * The per-date launch_quota row is used as the serialization lock. Capacity is
 * always re-derived from project rows while holding that lock, so any number of
 * concurrent PAYMENT_PENDING checkouts cannot overbook a launch date.
 */
export async function confirmPaidPremiumLaunch(
  projectId: string,
  options: ConfirmPaidPremiumLaunchOptions = {},
): Promise<PremiumLaunchConfirmationResult> {
  return db.transaction(async (tx) => {
    const [candidate] = await tx
      .select({
        id: project.id,
        slug: project.slug,
        createdBy: project.createdBy,
        launchType: project.launchType,
        launchStatus: project.launchStatus,
        scheduledLaunchDate: project.scheduledLaunchDate,
      })
      .from(project)
      .where(eq(project.id, projectId))
      .for("update")
      .limit(1)

    if (!candidate) return { status: "rejected", reason: "not_found" }
    if (candidate.launchStatus !== launchStatus.PAYMENT_PENDING) {
      const validCompletedLaunch = isCompletedLaunchForConfirmation({
        status: candidate.launchStatus,
        type: candidate.launchType,
        allowNonPremiumProcessed: options.allowNonPremiumProcessed,
      })
      if (validCompletedLaunch) {
        return {
          status: "already_processed",
          projectId: candidate.id,
          slug: candidate.slug,
          launchStatus: candidate.launchStatus,
        }
      }
      return { status: "rejected", reason: "invalid_project" }
    }
    if (
      candidate.launchType !== launchType.PREMIUM ||
      !candidate.scheduledLaunchDate ||
      !candidate.createdBy
    ) {
      return { status: "rejected", reason: "invalid_project" }
    }

    const launchDate = candidate.scheduledLaunchDate
    await tx
      .insert(launchQuota)
      .values({
        id: crypto.randomUUID(),
        date: launchDate,
        freeCount: 0,
        badgeCount: 0,
        premiumCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoNothing({ target: launchQuota.date })

    const [quota] = await tx
      .select({ id: launchQuota.id })
      .from(launchQuota)
      .where(eq(launchQuota.date, launchDate))
      .for("update")
      .limit(1)
    if (!quota) return { status: "rejected", reason: "invalid_project" }

    const dayStart = new Date(
      Date.UTC(launchDate.getUTCFullYear(), launchDate.getUTCMonth(), launchDate.getUTCDate()),
    )
    const dayEnd = new Date(dayStart)
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1)

    const [counts] = await tx
      .select({
        freeCount: countInt(sql`${project.launchType} = ${launchType.FREE}`),
        badgeCount: countInt(sql`${project.launchType} = ${launchType.FREE_WITH_BADGE}`),
        premiumCount: countInt(sql`${project.launchType} = ${launchType.PREMIUM}`),
        totalCount: countInt(),
      })
      .from(project)
      .where(
        and(
          eq(project.launchStatus, launchStatus.SCHEDULED),
          gte(project.scheduledLaunchDate, dayStart),
          lt(project.scheduledLaunchDate, dayEnd),
        ),
      )

    const [userCount] = await tx
      .select({ count: countInt() })
      .from(project)
      .where(
        and(
          eq(project.createdBy, candidate.createdBy),
          eq(project.launchStatus, launchStatus.SCHEDULED),
          gte(project.scheduledLaunchDate, dayStart),
          lt(project.scheduledLaunchDate, dayEnd),
        ),
      )
    const capacityRejection = getPremiumCapacityRejection({
      totalCount: counts?.totalCount ?? 0,
      userCount: userCount?.count ?? 0,
    })
    if (capacityRejection) return { status: "rejected", reason: capacityRejection }

    const now = new Date()
    await tx
      .update(project)
      .set({
        launchStatus: launchStatus.SCHEDULED,
        featuredOnHomepage: false,
        updatedAt: now,
      })
      .where(
        and(eq(project.id, candidate.id), eq(project.launchStatus, launchStatus.PAYMENT_PENDING)),
      )

    await tx
      .update(launchQuota)
      .set({
        freeCount: counts?.freeCount ?? 0,
        badgeCount: counts?.badgeCount ?? 0,
        premiumCount: (counts?.premiumCount ?? 0) + 1,
        updatedAt: now,
      })
      .where(eq(launchQuota.id, quota.id))

    return { status: "scheduled", projectId: candidate.id, slug: candidate.slug }
  })
}
