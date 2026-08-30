"use server"

import { revalidatePath, revalidateTag } from "next/cache"

import { db } from "@/drizzle/db"
import { project } from "@/drizzle/db/schema"
import { eq } from "drizzle-orm"

import { PROJECT_RELATED_TAG } from "@/lib/cache-tags"
import { requireAdmin } from "@/lib/server-auth"

/**
 * Manual override toggle for the AI quality verdict. Admin can flip a
 * project to / from low-quality at any time; we set qualityCheckedAt to
 * NOW() so the auto cron won't immediately re-classify and overwrite the
 * decision.
 */
export async function setProjectLowQuality(projectId: string, isLowQuality: boolean) {
  await requireAdmin("Forbidden")
  await db
    .update(project)
    .set({
      isLowQuality,
      qualityCheckedAt: new Date(),
      qualityReason: isLowQuality ? "Manually flagged by admin" : "Manually cleared by admin",
    })
    .where(eq(project.id, projectId))
  revalidatePath("/admin/quality")
  // Low-quality projects are filtered out of the "related products"
  // recommendations (6h TTL cache) — bust so a flag takes effect now.
  revalidateTag(PROJECT_RELATED_TAG, "max")
}
