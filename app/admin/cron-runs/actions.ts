"use server"

import { revalidatePath } from "next/cache"

import { db } from "@/drizzle/db"
import { cronSchedule } from "@/drizzle/db/schema"
import { eq } from "drizzle-orm"

import { isValidCronExpression } from "@/lib/cron-match"
import { requireAdmin } from "@/lib/server-auth"

/**
 * Toggle the enabled flag on a single cron task. Disabled tasks stay in
 * the schedule (so admin can see they exist) but the dispatcher won't
 * fire them.
 */
export async function toggleCronEnabled(id: number, enabled: boolean) {
  await requireAdmin("Forbidden")
  await db
    .update(cronSchedule)
    .set({ enabled, updatedAt: new Date() })
    .where(eq(cronSchedule.id, id))
  revalidatePath("/admin/cron-runs")
}

/**
 * Update the cron expression on a single task. Validates with cron-parser
 * before persisting — the dispatcher would otherwise silently drop the
 * task on every tick if the expression were invalid.
 */
export async function updateCronExpression(id: number, expression: string) {
  await requireAdmin("Forbidden")
  const trimmed = expression.trim()
  if (!isValidCronExpression(trimmed)) {
    // Throw so the inline form's failed save surfaces — silent return would
    // just re-render the page with the old value and look like a no-op.
    throw new Error(`Invalid cron expression: ${trimmed || "(empty)"}`)
  }
  await db
    .update(cronSchedule)
    .set({ cronExpression: trimmed, updatedAt: new Date() })
    .where(eq(cronSchedule.id, id))
  revalidatePath("/admin/cron-runs")
}
