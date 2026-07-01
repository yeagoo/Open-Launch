import { db } from "@/drizzle/db"
import { skillPublication, skillSubmission, skillSubmissionVariant } from "@/drizzle/db/schema"
import { and, asc, eq } from "drizzle-orm"

export interface SkillStatusPublication {
  site: string
  title: string | null
  tagline: string | null
  batchDay: number
  scheduledFor: string
  status: string
  externalUrl: string | null
  lastError: string | null
  sentAt: string | null
}

export interface SkillStatusView {
  id: string
  domain: string
  websiteUrl: string
  status: string
  reviewScore: number | null
  reviewReason: string | null
  locale: string
  createdAt: string
  updatedAt: string
  total: number
  sent: number
  failed: number
  scheduled: number
  unpublished: number
  publications: SkillStatusPublication[]
}

export async function getSkillStatusView(uuid: string): Promise<SkillStatusView | null> {
  const [submission] = await db
    .select()
    .from(skillSubmission)
    .where(eq(skillSubmission.id, uuid))
    .limit(1)

  if (!submission) return null

  const rows = await db
    .select({
      site: skillPublication.site,
      batchDay: skillPublication.batchDay,
      scheduledFor: skillPublication.scheduledFor,
      status: skillPublication.status,
      externalUrl: skillPublication.externalUrl,
      lastError: skillPublication.lastError,
      sentAt: skillPublication.sentAt,
      title: skillSubmissionVariant.title,
      tagline: skillSubmissionVariant.tagline,
    })
    .from(skillPublication)
    .leftJoin(
      skillSubmissionVariant,
      and(
        eq(skillSubmissionVariant.submissionId, skillPublication.submissionId),
        eq(skillSubmissionVariant.site, skillPublication.site),
      ),
    )
    .where(eq(skillPublication.submissionId, uuid))
    .orderBy(asc(skillPublication.batchDay), asc(skillPublication.scheduledFor))

  const publications = rows.map((row) => ({
    site: row.site,
    title: row.title,
    tagline: row.tagline,
    batchDay: row.batchDay,
    scheduledFor: row.scheduledFor,
    status: row.status,
    externalUrl: row.externalUrl,
    lastError: publicSkillPublicationError(row.status, row.lastError),
    sentAt: row.sentAt?.toISOString() ?? null,
  }))

  return {
    id: submission.id,
    domain: submission.domain,
    websiteUrl: submission.websiteUrl,
    status: submission.status,
    reviewScore: submission.reviewScore,
    reviewReason: submission.reviewReason,
    locale: submission.locale,
    createdAt: submission.createdAt.toISOString(),
    updatedAt: submission.updatedAt.toISOString(),
    total: publications.length,
    sent: publications.filter((row) => row.status === "sent").length,
    failed: publications.filter((row) => row.status === "failed").length,
    scheduled: publications.filter((row) => row.status === "scheduled").length,
    unpublished: publications.filter((row) => row.status === "unpublished").length,
    publications,
  }
}

export function publicSkillPublicationError(status: string, error: string | null): string | null {
  if (!error) return null
  if (status === "failed") return "Publication attempt failed."
  if (status === "unpublished") return "Listing was unpublished."
  return "Publication is temporarily deferred."
}
