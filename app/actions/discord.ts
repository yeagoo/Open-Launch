"use server"

import { headers } from "next/headers"

import { z } from "zod"

import { auth } from "@/lib/auth"
import { notifyDiscordForScheduledProject } from "@/lib/project-launch-notification"
import { checkRateLimit } from "@/lib/rate-limit"

const projectIdSchema = z.string().uuid()

/**
 * Notify Discord for a project that the authenticated caller owns and that is
 * already scheduled. All message fields come from the database; the browser
 * cannot forge names, URLs, dates, or launch types.
 */
export async function notifyDiscordLaunch(projectId: string) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) return { success: false, error: "Unauthorized" }

  const parsedId = projectIdSchema.safeParse(projectId)
  if (!parsedId.success) return { success: false, error: "Invalid project id" }

  const rate = await checkRateLimit(`discord-launch:${session.user.id}`, 5, 60 * 60 * 1000, {
    onRedisError: "fail-closed",
  })
  if (!rate.success) return { success: false, error: "Notification rate limit exceeded" }

  return notifyDiscordForScheduledProject(parsedId.data, session.user.id)
}
