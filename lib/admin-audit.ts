import { headers } from "next/headers"

import { db } from "@/drizzle/db"
import { adminAuditLog } from "@/drizzle/db/schema"

export type AdminAction =
  | "promo_code.generate"
  | "promo_code.deactivate"
  | "user.ban"
  | "user.unban"
  | "user.role_change"
  | "project.delete"
  | "project.feature"
  | "tag.approve"
  | "tag.reject"

interface LogAdminActionParams {
  adminUserId: string
  action: AdminAction
  targetType?: string
  targetId?: string
  metadata?: Record<string, unknown>
}

export async function logAdminAction({
  adminUserId,
  action,
  targetType,
  targetId,
  metadata,
}: LogAdminActionParams): Promise<void> {
  const hdrs = await headers()
  const ipAddress =
    hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? hdrs.get("x-real-ip") ?? null
  const userAgent = hdrs.get("user-agent") ?? null

  await db.insert(adminAuditLog).values({
    id: crypto.randomUUID(),
    adminUserId,
    action,
    targetType: targetType ?? null,
    targetId: targetId ?? null,
    metadata: metadata ?? null,
    ipAddress,
    userAgent,
  })
}
