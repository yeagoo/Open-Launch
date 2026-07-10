import { db } from "@/drizzle/db"
import { launchStatus, project } from "@/drizzle/db/schema"
import { and, eq } from "drizzle-orm"

import { resolveAppUrl } from "@/lib/app-url"
import { notifyDiscordLaunch } from "@/lib/discord-notification"
import { clearDedupe, dedupeOnce } from "@/lib/rate-limit"

/** Send a launch notification using database-owned fields only. */
export async function notifyDiscordForScheduledProject(projectId: string, ownerId?: string) {
  const conditions = [eq(project.id, projectId), eq(project.launchStatus, launchStatus.SCHEDULED)]
  if (ownerId) conditions.push(eq(project.createdBy, ownerId))

  const [scheduledProject] = await db
    .select({
      id: project.id,
      slug: project.slug,
      name: project.name,
      websiteUrl: project.websiteUrl,
      launchType: project.launchType,
      scheduledLaunchDate: project.scheduledLaunchDate,
      createdBy: project.createdBy,
    })
    .from(project)
    .where(and(...conditions))
    .limit(1)

  if (
    !scheduledProject?.scheduledLaunchDate ||
    !scheduledProject.launchType ||
    !scheduledProject.createdBy
  ) {
    return { success: false, error: "Project is not scheduled or not owned by current user" }
  }

  const dedupeKey = `discord-launch:${scheduledProject.id}`
  const firstNotification = await dedupeOnce(dedupeKey, 7 * 24 * 3600)
  if (!firstNotification) return { success: true, deduplicated: true }

  const projectUrl = `${resolveAppUrl().replace(/\/$/, "")}/projects/${scheduledProject.slug}`
  const sent = await notifyDiscordLaunch(
    scheduledProject.name,
    scheduledProject.scheduledLaunchDate.toISOString().slice(0, 10),
    scheduledProject.launchType,
    scheduledProject.websiteUrl,
    projectUrl,
    scheduledProject.createdBy,
  )

  if (sent) return { success: true }
  await clearDedupe(dedupeKey)
  return { success: false, error: "Notification sending function indicated failure" }
}
