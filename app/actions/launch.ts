"use server"

import { revalidatePath } from "next/cache"
import { headers } from "next/headers"

import { db } from "@/drizzle/db"
import {
  launchQuota,
  launchStatus,
  LaunchStatus,
  launchType,
  LaunchType,
  project as projectTable,
} from "@/drizzle/db/schema"
import { addDays, format, isBefore, parse } from "date-fns"
import { and, count as drizzleCount, eq, gte, lt, ne, sql } from "drizzle-orm"

import { auth } from "@/lib/auth"
import {
  DATE_FORMAT,
  LAUNCH_LIMITS,
  LAUNCH_SETTINGS,
  LAUNCH_TYPES,
  USER_DAILY_LAUNCH_LIMIT,
} from "@/lib/constants"
import { countInt } from "@/lib/db-utils"

async function getSession() {
  return auth.api.getSession({ headers: await headers() })
}

export interface LaunchAvailability {
  date: string
  freeSlots: number // 基础免费配额
  badgeSlots: number // Badge 验证用户配额
  premiumSlots: number // Premium Launch 配额（保留但不再区分）
  totalSlots: number
  // Total projects already scheduled for this date (across all launch
  // types). Drives the "crowdedness" badge in the submit form date
  // picker — distinct from `*Slots` which are *remaining* capacity.
  scheduledCount: number
}

// Fonction pour obtenir la disponibilité des lancements pour une date spécifique
export async function getLaunchAvailability(date: string): Promise<LaunchAvailability> {
  // Vérifier si la date est au format correct
  const parsedDate = parse(date, DATE_FORMAT.API, new Date())
  const formattedDate = format(parsedDate, DATE_FORMAT.API)

  // Obtenir le nombre de lancements déjà programmés pour cette date
  const scheduledLaunches = await db
    .select({
      // `countInt` casts BIGINT → int4 so pg returns a JS number,
      // not a string. See `lib/db-utils.ts` for the rationale —
      // without the cast, `premiumSlots` math below would silently
      // turn into string concatenation and every date would render
      // as "0 slots available".
      freeCount: countInt(sql`${projectTable.launchType} = ${launchType.FREE}`),
      badgeCount: countInt(sql`${projectTable.launchType} = 'free_with_badge'`),
      premiumCount: countInt(sql`${projectTable.launchType} = ${launchType.PREMIUM}`),
      totalCount: countInt(),
    })
    .from(projectTable)
    .where(
      and(
        gte(projectTable.scheduledLaunchDate, parsedDate),
        lt(projectTable.scheduledLaunchDate, addDays(parsedDate, 1)),
        // Ne compter que les chaînes programmées (pas celles en attente de paiement)
        eq(projectTable.launchStatus, launchStatus.SCHEDULED),
      ),
    )

  // Calculer les places disponibles
  const freeCount = scheduledLaunches[0]?.freeCount || 0
  const badgeCount = scheduledLaunches[0]?.badgeCount || 0
  const premiumCount = scheduledLaunches[0]?.premiumCount || 0
  const totalCount = scheduledLaunches[0]?.totalCount || 0

  const freeSlots = Math.max(0, LAUNCH_LIMITS.FREE_DAILY_LIMIT - freeCount)
  const badgeSlots = Math.max(0, LAUNCH_LIMITS.BADGE_DAILY_LIMIT - badgeCount)
  const premiumSlots = Math.max(
    0,
    LAUNCH_LIMITS.PREMIUM_DAILY_LIMIT - (premiumCount + freeCount + badgeCount),
  )
  const totalSlots = Math.max(0, LAUNCH_LIMITS.TOTAL_DAILY_LIMIT - totalCount)

  // Retourner la disponibilité
  return {
    date: formattedDate,
    freeSlots,
    badgeSlots,
    premiumSlots,
    totalSlots,
    scheduledCount: totalCount,
  }
}

// Fonction pour obtenir la disponibilité des lancements pour une plage de dates
export async function getLaunchAvailabilityRange(
  startDate: string,
  endDate: string,
  launchTypeValue: (typeof LAUNCH_TYPES)[keyof typeof LAUNCH_TYPES] = LAUNCH_TYPES.FREE,
): Promise<LaunchAvailability[]> {
  // Déterminer la date minimale de planification en fonction du type de lancement
  const today = new Date()
  let minDaysAhead: number = LAUNCH_SETTINGS.MIN_DAYS_AHEAD
  let maxDaysAhead: number = LAUNCH_SETTINGS.MAX_DAYS_AHEAD

  // Badge-verified users skip the regular queue.
  if (launchTypeValue === LAUNCH_TYPES.FREE_WITH_BADGE) {
    minDaysAhead = LAUNCH_SETTINGS.BADGE_MIN_DAYS_AHEAD
  } else if (launchTypeValue === LAUNCH_TYPES.PREMIUM) {
    minDaysAhead = LAUNCH_SETTINGS.PREMIUM_MIN_DAYS_AHEAD
    maxDaysAhead = LAUNCH_SETTINGS.PREMIUM_MAX_DAYS_AHEAD
  }

  // Calculer la date minimale (au moins le lendemain)
  const minDate = addDays(today, minDaysAhead)
  const maxDate = addDays(today, maxDaysAhead)

  // Vérifier si les dates sont au format correct
  const parsedStartDate = parse(startDate, DATE_FORMAT.API, new Date())
  const parsedEndDate = parse(endDate, DATE_FORMAT.API, new Date())

  // Ajuster la date de début si elle est avant la date minimale
  const adjustedStartDate = isBefore(parsedStartDate, minDate) ? minDate : parsedStartDate

  // Ajuster la date de fin si elle est après la date maximale
  const adjustedEndDate = isBefore(maxDate, parsedEndDate) ? maxDate : parsedEndDate

  // Générer toutes les dates dans la plage
  const dates: Date[] = []
  let currentDate = adjustedStartDate
  while (currentDate <= adjustedEndDate) {
    dates.push(new Date(currentDate))
    currentDate = addDays(currentDate, 1)
  }

  // Obtenir la disponibilité pour chaque date
  const availabilityPromises = dates.map((date) =>
    getLaunchAvailability(format(date, DATE_FORMAT.API)),
  )
  const availabilityResults = await Promise.all(availabilityPromises)

  return availabilityResults
}

// vérifier la limite de lancement de l'utilisateur
export async function checkUserLaunchLimit(
  userId: string,
  launchDate: string,
): Promise<{ allowed: boolean; count: number; limit: number }> {
  // 所有用户统一限制
  const limit = USER_DAILY_LAUNCH_LIMIT

  const [year, month, day] = launchDate.split("-").map(Number)
  const dateStart = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0))
  const nextDayStart = new Date(dateStart)
  nextDayStart.setUTCDate(dateStart.getUTCDate() + 1)

  const userLaunchCountResult = await db
    .select({ value: drizzleCount(projectTable.id) })
    .from(projectTable)
    .where(
      and(
        eq(projectTable.createdBy, userId),
        gte(projectTable.scheduledLaunchDate, dateStart), // Utiliser dateStart UTC
        lt(projectTable.scheduledLaunchDate, nextDayStart), // Utiliser nextDayStart UTC
        // Exclure les projets dont le paiement est en attente ou a échoué
        ne(projectTable.launchStatus, launchStatus.PAYMENT_FAILED),
        ne(projectTable.launchStatus, launchStatus.PAYMENT_PENDING),
      ),
    )

  const currentCount = userLaunchCountResult[0]?.value || 0
  const allowed = currentCount < limit

  return { allowed, count: currentCount, limit }
}

// Fonction pour planifier un lancement
export async function scheduleLaunch(
  projectId: string,
  date: string,
  launchTypeValue: (typeof LAUNCH_TYPES)[keyof typeof LAUNCH_TYPES],
): Promise<boolean> {
  const session = await getSession()
  if (!session?.user?.id) {
    throw new Error("Authentication required.")
  }
  const userId = session.user.id

  // ─── Input validation (no DB I/O yet) ──────────────────────────────────────
  let parsedDate: Date
  try {
    parsedDate = parse(date, DATE_FORMAT.API, new Date())
    if (isNaN(parsedDate.getTime())) throw new Error("Invalid date after parsing")
  } catch {
    parsedDate = new Date(date)
    if (isNaN(parsedDate.getTime())) {
      throw new Error(`Invalid date format: ${date}`)
    }
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  let minDaysAhead: number = LAUNCH_SETTINGS.MIN_DAYS_AHEAD
  let maxDaysAhead: number = LAUNCH_SETTINGS.MAX_DAYS_AHEAD
  if (launchTypeValue === LAUNCH_TYPES.FREE_WITH_BADGE) {
    minDaysAhead = LAUNCH_SETTINGS.BADGE_MIN_DAYS_AHEAD
  } else if (launchTypeValue === LAUNCH_TYPES.PREMIUM) {
    minDaysAhead = LAUNCH_SETTINGS.PREMIUM_MIN_DAYS_AHEAD
    maxDaysAhead = LAUNCH_SETTINGS.PREMIUM_MAX_DAYS_AHEAD
  }

  const minDate = addDays(today, minDaysAhead)
  const maxDate = addDays(today, maxDaysAhead)
  const normalizedParsedDate = new Date(parsedDate)
  normalizedParsedDate.setHours(0, 0, 0, 0)

  if (normalizedParsedDate < minDate) {
    throw new Error(`Launch date must be at least ${minDaysAhead} day(s) in advance`)
  }
  if (normalizedParsedDate > maxDate) {
    throw new Error(
      `Launch date cannot be more than ${maxDaysAhead} days in advance for this launch type`,
    )
  }

  // Canonical UTC launch timestamp (always at LAUNCH_HOUR_UTC on the chosen day)
  const launchDate = new Date(
    Date.UTC(
      parsedDate.getFullYear(),
      parsedDate.getMonth(),
      parsedDate.getDate(),
      LAUNCH_SETTINGS.LAUNCH_HOUR_UTC,
      0,
      0,
      0,
    ),
  )

  const initialStatus: LaunchStatus =
    launchTypeValue === LAUNCH_TYPES.PREMIUM ? launchStatus.PAYMENT_PENDING : launchStatus.SCHEDULED
  const isFreeOrBadge =
    launchTypeValue === LAUNCH_TYPES.FREE || launchTypeValue === LAUNCH_TYPES.FREE_WITH_BADGE

  // ─── Atomic schedule + quota update inside a single transaction ────────────
  // Locks the project row + launchQuota row for the date so concurrent calls serialize.
  try {
    await db.transaction(async (tx) => {
      // 1. Lock the project row and verify ownership + reschedule guard
      const [project] = await tx
        .select({
          id: projectTable.id,
          createdBy: projectTable.createdBy,
          hasBadgeVerified: projectTable.hasBadgeVerified,
          launchStatus: projectTable.launchStatus,
          scheduledLaunchDate: projectTable.scheduledLaunchDate,
        })
        .from(projectTable)
        .where(eq(projectTable.id, projectId))
        .for("update")
        .limit(1)

      if (!project) throw new Error("Project not found.")
      if (project.createdBy !== userId) {
        throw new Error("You do not have permission to schedule this project.")
      }

      // Reschedule guard: only allow scheduling when the project has no live
      // schedule yet. Re-attempt is allowed only after a failed payment.
      if (project.scheduledLaunchDate && project.launchStatus !== launchStatus.PAYMENT_FAILED) {
        throw new Error("This project is already scheduled.")
      }

      if (launchTypeValue === LAUNCH_TYPES.FREE_WITH_BADGE && !project.hasBadgeVerified) {
        throw new Error(
          "Badge not verified. Please verify your badge before scheduling a badge launch.",
        )
      }

      // 2. Ensure the launchQuota row for this date exists, then lock it.
      // Concurrent scheduleLaunch calls for the same date all serialize on this lock.
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
        .select()
        .from(launchQuota)
        .where(eq(launchQuota.date, launchDate))
        .for("update")
        .limit(1)

      if (!quota) {
        throw new Error("Failed to acquire launch quota lock")
      }

      // 3. Re-count actual scheduled projects on this date INSIDE the lock.
      // The quota counter is denormalized; the project table is canonical.
      const dayStart = new Date(parsedDate)
      dayStart.setHours(0, 0, 0, 0)
      const dayEnd = addDays(dayStart, 1)
      const [counts] = await tx
        .select({
          freeCount: countInt(sql`${projectTable.launchType} = ${launchType.FREE}`),
          badgeCount: countInt(sql`${projectTable.launchType} = 'free_with_badge'`),
          premiumCount: countInt(sql`${projectTable.launchType} = ${launchType.PREMIUM}`),
          total: countInt(),
        })
        .from(projectTable)
        .where(
          and(
            gte(projectTable.scheduledLaunchDate, dayStart),
            lt(projectTable.scheduledLaunchDate, dayEnd),
            eq(projectTable.launchStatus, launchStatus.SCHEDULED),
            // Exclude the current project so re-attempts after PAYMENT_FAILED don't double-count
            ne(projectTable.id, projectId),
          ),
        )

      const freeCount = counts?.freeCount ?? 0
      const badgeCount = counts?.badgeCount ?? 0
      const premiumCount = counts?.premiumCount ?? 0
      const totalCount = counts?.total ?? 0

      if (totalCount >= LAUNCH_LIMITS.TOTAL_DAILY_LIMIT) {
        throw new Error("No availability for the selected date")
      }
      if (launchTypeValue === LAUNCH_TYPES.FREE && freeCount >= LAUNCH_LIMITS.FREE_DAILY_LIMIT) {
        throw new Error("No free launch slots available for the selected date")
      }
      if (
        launchTypeValue === LAUNCH_TYPES.FREE_WITH_BADGE &&
        badgeCount >= LAUNCH_LIMITS.BADGE_DAILY_LIMIT
      ) {
        throw new Error("No badge launch slots available for the selected date")
      }
      if (
        launchTypeValue === LAUNCH_TYPES.PREMIUM &&
        premiumCount + freeCount + badgeCount >= LAUNCH_LIMITS.PREMIUM_DAILY_LIMIT
      ) {
        throw new Error("No premium launch slots available for the selected date")
      }

      // 4. Per-user daily limit (also inside the TX for consistency)
      const [userCount] = await tx
        .select({ value: drizzleCount(projectTable.id) })
        .from(projectTable)
        .where(
          and(
            eq(projectTable.createdBy, userId),
            gte(projectTable.scheduledLaunchDate, dayStart),
            lt(projectTable.scheduledLaunchDate, dayEnd),
            ne(projectTable.launchStatus, launchStatus.PAYMENT_FAILED),
            ne(projectTable.launchStatus, launchStatus.PAYMENT_PENDING),
            ne(projectTable.id, projectId),
          ),
        )
      if ((userCount?.value ?? 0) >= USER_DAILY_LAUNCH_LIMIT) {
        throw new Error(
          `You have reached your daily launch limit of ${USER_DAILY_LAUNCH_LIMIT} project(s) for this date.`,
        )
      }

      // 5. Update project
      await tx
        .update(projectTable)
        .set({
          scheduledLaunchDate: launchDate,
          launchType: launchTypeValue as LaunchType,
          launchStatus: initialStatus,
          featuredOnHomepage: false,
          updatedAt: new Date(),
        })
        .where(eq(projectTable.id, projectId))

      // 6. Update denormalized quota counter (premium quota is updated post-payment)
      if (isFreeOrBadge) {
        const isBadge = launchTypeValue === LAUNCH_TYPES.FREE_WITH_BADGE
        await tx
          .update(launchQuota)
          .set({
            ...(isBadge
              ? { badgeCount: sql`${launchQuota.badgeCount} + 1` }
              : { freeCount: sql`${launchQuota.freeCount} + 1` }),
            updatedAt: new Date(),
          })
          .where(eq(launchQuota.id, quota.id))
      }
    })

    revalidatePath("/")
    revalidatePath("/dashboard")
    revalidatePath(`/projects/${projectId}`)
    return true
  } catch (error) {
    console.error("Error scheduling launch:", error)
    throw error
  }
}

// Mettre à jour le statut des chaînes dont la date de lancement est aujourd'hui
export async function updateProjectStatusToOngoing() {
  const todayStart = new Date()
  // Utiliser l'heure de lancement définie dans les constantes
  todayStart.setUTCHours(LAUNCH_SETTINGS.LAUNCH_HOUR_UTC, 0, 0, 0)

  // Trouver les chaînes programmées pour aujourd'hui
  // Ne mettre à jour que les chaînes avec le statut SCHEDULED (pas PAYMENT_PENDING)
  const result = await db
    .update(projectTable)
    .set({
      launchStatus: launchStatus.ONGOING,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(projectTable.launchStatus, launchStatus.SCHEDULED),
        gte(projectTable.scheduledLaunchDate, todayStart),
        lt(projectTable.scheduledLaunchDate, addDays(todayStart, 1)),
      ),
    )

  console.log(`Updated ${result.rowCount} projects to ONGOING`)
  return { success: true, updatedCount: result.rowCount }
}

// Mettre à jour le statut des chaînes dont la date de lancement était hier
export async function updateProjectStatusToLaunched() {
  const today = new Date()
  const yesterdayStart = new Date(today)
  yesterdayStart.setDate(yesterdayStart.getDate() - 1)
  // Utiliser l'heure de lancement définie dans les constantes
  yesterdayStart.setUTCHours(LAUNCH_SETTINGS.LAUNCH_HOUR_UTC, 0, 0, 0)

  // Trouver les chaînes en cours de lancement depuis hier
  // Ne mettre à jour que les chaînes avec le statut ONGOING
  const result = await db
    .update(projectTable)
    .set({
      launchStatus: launchStatus.LAUNCHED,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(projectTable.launchStatus, launchStatus.ONGOING),
        gte(projectTable.scheduledLaunchDate, yesterdayStart),
        lt(projectTable.scheduledLaunchDate, addDays(yesterdayStart, 1)),
      ),
    )

  console.log(`Updated ${result.rowCount} projects to LAUNCHED`)
  return { success: true, updatedCount: result.rowCount }
}
