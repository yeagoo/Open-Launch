import { db } from "@/drizzle/db"
import { skillPublication, skillSubmission } from "@/drizzle/db/schema"
import { and, eq } from "drizzle-orm"

import { postSkillUnpublishToSite } from "@/lib/skill-publishing"
import { sendSkillAdminAlert } from "@/lib/transactional-emails"

export interface SkillTakedownResult {
  submissionId: string
  attempted: number
  unpublished: number
  failed: number
}

export async function takedownSkillSubmission(
  submissionId: string,
  options: { reason: string; alertAdmin?: boolean },
): Promise<SkillTakedownResult> {
  const now = new Date()
  const [submission] = await db
    .select({
      id: skillSubmission.id,
      domain: skillSubmission.domain,
      websiteUrl: skillSubmission.websiteUrl,
      status: skillSubmission.status,
    })
    .from(skillSubmission)
    .where(eq(skillSubmission.id, submissionId))
    .limit(1)

  if (!submission) {
    return { submissionId, attempted: 0, unpublished: 0, failed: 0 }
  }

  const sentRows = await db
    .select({
      id: skillPublication.id,
      site: skillPublication.site,
      submissionId: skillPublication.submissionId,
    })
    .from(skillPublication)
    .where(
      and(eq(skillPublication.submissionId, submissionId), eq(skillPublication.status, "sent")),
    )

  let unpublished = 0
  let failed = 0

  await Promise.all(
    sentRows.map(async (row) => {
      const idempotencyKey = skillPublicationIdempotencyKey(row.submissionId, row.site)
      const result = await postSkillUnpublishToSite(row.site, idempotencyKey, submission.websiteUrl)

      if (result.ok) {
        unpublished++
        await db
          .update(skillPublication)
          .set({
            status: "unpublished",
            lastError: null,
            updatedAt: now,
          })
          .where(eq(skillPublication.id, row.id))
      } else {
        failed++
        await db
          .update(skillPublication)
          .set({
            lastError: result.error ?? "unpublish failed",
            updatedAt: now,
          })
          .where(eq(skillPublication.id, row.id))
      }
    }),
  )

  await db
    .update(skillSubmission)
    .set({
      status: "taken_down",
      reviewReason: options.reason,
      updatedAt: now,
    })
    .where(eq(skillSubmission.id, submissionId))

  if (options.alertAdmin) {
    await sendSkillAdminAlert({
      subject: "Skill submission auto-takedown",
      message: `${options.reason}. Unpublished ${unpublished}/${sentRows.length} sent listings; ${failed} unpublish calls failed.`,
      submissionId,
      domain: submission.domain,
    }).catch((error) => {
      console.error("[skill-takedown] admin alert failed:", error)
    })
  }

  return {
    submissionId,
    attempted: sentRows.length,
    unpublished,
    failed,
  }
}

export function skillPublicationIdempotencyKey(submissionId: string, site: string): string {
  return `skill:${submissionId}:${site}`
}
