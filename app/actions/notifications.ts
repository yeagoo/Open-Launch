"use server"

import { headers } from "next/headers"

import { db } from "@/drizzle/db"
import { notification, project, user } from "@/drizzle/db/schema"
import { and, count, desc, eq, isNull } from "drizzle-orm"

import { auth } from "@/lib/auth"

const PAGE_SIZE = 20

async function requireUserId(): Promise<string> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) throw new Error("Authentication required")
  return session.user.id
}

export interface NotificationItem {
  id: string
  type: string
  actorId: string | null
  actorName: string | null
  projectName: string | null
  projectSlug: string | null
  metadata: Record<string, unknown> | null
  readAt: Date | null
  createdAt: Date
}

/** Unread badge count for the nav bell. Cheap: partial index on read_at. */
export async function getUnreadNotificationCount(): Promise<number> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) return 0
  const [row] = await db
    .select({ value: count() })
    .from(notification)
    .where(and(eq(notification.userId, session.user.id), isNull(notification.readAt)))
  return row?.value ?? 0
}

export async function getNotifications(page = 1): Promise<{
  items: NotificationItem[]
  totalCount: number
}> {
  const userId = await requireUserId()
  const safePage = Math.max(1, Math.min(100, Math.floor(page) || 1))

  const [items, [total]] = await Promise.all([
    db
      .select({
        id: notification.id,
        type: notification.type,
        metadata: notification.metadata,
        readAt: notification.readAt,
        createdAt: notification.createdAt,
        actorId: notification.actorId,
        actorName: user.name,
        projectName: project.name,
        projectSlug: project.slug,
      })
      .from(notification)
      .leftJoin(user, eq(user.id, notification.actorId))
      .leftJoin(project, eq(project.id, notification.projectId))
      .where(eq(notification.userId, userId))
      .orderBy(desc(notification.createdAt))
      .limit(PAGE_SIZE)
      .offset((safePage - 1) * PAGE_SIZE),
    db.select({ value: count() }).from(notification).where(eq(notification.userId, userId)),
  ])

  return {
    items: items.map((item) => ({
      ...item,
      metadata: (item.metadata as Record<string, unknown> | null) ?? null,
    })),
    totalCount: total?.value ?? 0,
  }
}

/** Latest few unread items for the bell popover. */
export async function getRecentUnreadNotifications(limit = 5): Promise<NotificationItem[]> {
  const userId = await requireUserId()
  const items = await db
    .select({
      id: notification.id,
      type: notification.type,
      metadata: notification.metadata,
      readAt: notification.readAt,
      createdAt: notification.createdAt,
      actorId: notification.actorId,
      actorName: user.name,
      projectName: project.name,
      projectSlug: project.slug,
    })
    .from(notification)
    .leftJoin(user, eq(user.id, notification.actorId))
    .leftJoin(project, eq(project.id, notification.projectId))
    .where(and(eq(notification.userId, userId), isNull(notification.readAt)))
    .orderBy(desc(notification.createdAt))
    .limit(Math.min(10, Math.max(1, limit)))
  return items.map((item) => ({
    ...item,
    metadata: (item.metadata as Record<string, unknown> | null) ?? null,
  }))
}

export async function markNotificationRead(id: string): Promise<void> {
  const userId = await requireUserId()
  // Ownership guard in the WHERE — never mark someone else's rows.
  await db
    .update(notification)
    .set({ readAt: new Date() })
    .where(and(eq(notification.id, id), eq(notification.userId, userId)))
}

export async function markAllNotificationsRead(): Promise<void> {
  const userId = await requireUserId()
  await db
    .update(notification)
    .set({ readAt: new Date() })
    .where(and(eq(notification.userId, userId), isNull(notification.readAt)))
}
