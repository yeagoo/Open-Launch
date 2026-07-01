import { NextRequest, NextResponse } from "next/server"

import { db } from "@/drizzle/db"
import {
  skillPublication,
  skillSubmission,
  skillSubmissionVariant,
  user,
} from "@/drizzle/db/schema"
import { and, asc, eq, isNull, lt, lte, or } from "drizzle-orm"

import { resolveAppUrl } from "@/lib/app-url"
import { verifyCronAuth } from "@/lib/cron-auth"
import { checkRateLimit } from "@/lib/rate-limit"
import {
  buildSkillLaunchPayload,
  postSkillLaunchToSite,
  type SkillPostResult,
} from "@/lib/skill-publishing"
import {
  isSkillReviewRejected,
  reviewSkillCanaryPages,
  type SkillCanaryReviewPage,
} from "@/lib/skill-review"
import { buildSkillStatusUrl } from "@/lib/skill-submit"
import { skillPublicationIdempotencyKey, takedownSkillSubmission } from "@/lib/skill-takedown"
import { tinyfishCrawl } from "@/lib/tinyfish"
import { sendSkillSubmissionCompletedEmail } from "@/lib/transactional-emails"

export const dynamic = "force-dynamic"
export const maxDuration = 60

const MAX_ATTEMPTS = 8
const BATCH = 25
const GLOBAL_DAILY_LIMIT = 10
const GLOBAL_DAILY_WINDOW_MS = 24 * 60 * 60 * 1000

type DueRow = Awaited<ReturnType<typeof loadDueRows>>[number]

export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request)
  if (authError) return authError

  const now = new Date()
  const today = dateOnlyUtc(now)
  const canaryPassedThisRun = new Set<string>()

  const due = await loadDueRows(now, today)
  let sent = 0
  let failed = 0
  let deferred = 0
  let throttled = 0
  let canaryWaiting = 0
  let takenDown = 0

  for (const row of due) {
    if (row.batchDay > 1) {
      const gate = await ensureCanaryGate(row, canaryPassedThisRun)
      if (gate === "wait") {
        canaryWaiting++
        continue
      }
      if (gate === "taken_down") {
        takenDown++
        continue
      }
    }

    const budget = await checkRateLimit(
      "skill-global",
      GLOBAL_DAILY_LIMIT,
      GLOBAL_DAILY_WINDOW_MS,
      { onRedisError: "fail-closed" },
    )
    if (!budget.success) {
      throttled++
      break
    }

    const payload = buildSkillLaunchPayload({
      title: row.title,
      tagline: row.tagline,
      bodyMd: row.bodyMd,
      websiteUrl: row.websiteUrl,
    })
    const result = await postSkillLaunchToSite(
      row.site,
      skillPublicationIdempotencyKey(row.submissionId, row.site),
      payload,
    )

    const outcome = await recordPublishResult(row, result, now)
    if (outcome === "sent") sent++
    else if (outcome === "failed") failed++
    else deferred++
  }

  const completed = await promoteCompletedSubmissions(now)

  return NextResponse.json({
    checkedAt: now.toISOString(),
    due: due.length,
    sent,
    failed,
    deferred,
    throttled,
    canaryWaiting,
    takenDown,
    completed,
  })
}

async function loadDueRows(now: Date, today: string) {
  return db
    .select({
      id: skillPublication.id,
      submissionId: skillPublication.submissionId,
      site: skillPublication.site,
      batchDay: skillPublication.batchDay,
      attempts: skillPublication.attempts,
      domain: skillSubmission.domain,
      websiteUrl: skillSubmission.websiteUrl,
      title: skillSubmissionVariant.title,
      tagline: skillSubmissionVariant.tagline,
      bodyMd: skillSubmissionVariant.bodyMd,
      createdAt: skillSubmission.createdAt,
    })
    .from(skillPublication)
    .innerJoin(skillSubmission, eq(skillSubmission.id, skillPublication.submissionId))
    .innerJoin(
      skillSubmissionVariant,
      and(
        eq(skillSubmissionVariant.submissionId, skillPublication.submissionId),
        eq(skillSubmissionVariant.site, skillPublication.site),
      ),
    )
    .where(
      and(
        eq(skillSubmission.status, "publishing"),
        lte(skillPublication.scheduledFor, today),
        or(
          eq(skillPublication.status, "scheduled"),
          and(
            eq(skillPublication.status, "failed"),
            lt(skillPublication.attempts, MAX_ATTEMPTS),
            or(isNull(skillPublication.nextAttemptAt), lte(skillPublication.nextAttemptAt, now)),
          ),
        ),
      ),
    )
    .orderBy(
      asc(skillSubmission.createdAt),
      asc(skillPublication.batchDay),
      asc(skillPublication.createdAt),
    )
    .limit(BATCH)
}

type CanaryGate = "pass" | "wait" | "taken_down"

async function ensureCanaryGate(
  row: DueRow,
  canaryPassedThisRun: Set<string>,
): Promise<CanaryGate> {
  if (canaryPassedThisRun.has(row.submissionId)) return "pass"

  const rows = await db
    .select({
      site: skillPublication.site,
      batchDay: skillPublication.batchDay,
      status: skillPublication.status,
      externalUrl: skillPublication.externalUrl,
      title: skillSubmissionVariant.title,
      tagline: skillSubmissionVariant.tagline,
      bodyMd: skillSubmissionVariant.bodyMd,
    })
    .from(skillPublication)
    .leftJoin(
      skillSubmissionVariant,
      and(
        eq(skillSubmissionVariant.submissionId, skillPublication.submissionId),
        eq(skillSubmissionVariant.site, skillPublication.site),
      ),
    )
    .where(eq(skillPublication.submissionId, row.submissionId))

  if (rows.some((publication) => publication.batchDay > 1 && publication.status === "sent")) {
    canaryPassedThisRun.add(row.submissionId)
    return "pass"
  }

  const canaries = rows.filter((publication) => publication.batchDay === 1)
  if (
    canaries.length < 2 ||
    canaries.some((publication) => publication.status !== "sent" || !publication.externalUrl)
  ) {
    return "wait"
  }

  try {
    const pages: SkillCanaryReviewPage[] = []
    for (const canary of canaries) {
      if (!canary.externalUrl || !canary.title || !canary.tagline || !canary.bodyMd) return "wait"
      const crawled = await tinyfishCrawl(canary.externalUrl, { timeout: 60_000 })
      pages.push({
        site: canary.site,
        url: crawled.url,
        intendedTitle: canary.title,
        intendedTagline: canary.tagline,
        intendedBodyMd: canary.bodyMd,
        liveMarkdown: crawled.markdown,
      })
    }

    const verdict = await reviewSkillCanaryPages({
      domain: row.domain,
      websiteUrl: row.websiteUrl,
      pages,
    })
    if (isSkillReviewRejected(verdict)) {
      await takedownSkillSubmission(row.submissionId, {
        reason: `Canary AI re-check failed: ${verdict.reasons.join("; ")}`,
        alertAdmin: true,
      })
      return "taken_down"
    }
  } catch (error) {
    console.error("[skill-publish] canary re-check deferred:", row.submissionId, error)
    return "wait"
  }

  canaryPassedThisRun.add(row.submissionId)
  return "pass"
}

async function recordPublishResult(
  row: DueRow,
  result: SkillPostResult,
  now: Date,
): Promise<"sent" | "failed" | "deferred"> {
  if (result.ok) {
    await db
      .update(skillPublication)
      .set({
        status: "sent",
        attempts: row.attempts + 1,
        externalId: result.externalId ?? null,
        externalUrl: result.externalUrl ?? null,
        lastError: null,
        nextAttemptAt: null,
        sentAt: now,
        updatedAt: now,
      })
      .where(eq(skillPublication.id, row.id))
    return "sent"
  }

  if (result.configError) {
    await db
      .update(skillPublication)
      .set({
        lastError: result.error ?? "not configured",
        updatedAt: now,
      })
      .where(eq(skillPublication.id, row.id))
    return "deferred"
  }

  const attempts = row.attempts + 1
  const backoffMin = Math.min(2 ** attempts, 120)
  await db
    .update(skillPublication)
    .set({
      status: "failed",
      attempts,
      lastError: result.error ?? "unknown error",
      nextAttemptAt: new Date(now.getTime() + backoffMin * 60_000),
      updatedAt: now,
    })
    .where(eq(skillPublication.id, row.id))
  return "failed"
}

async function promoteCompletedSubmissions(now: Date): Promise<number> {
  const candidates = await db
    .select({
      id: skillSubmission.id,
      domain: skillSubmission.domain,
      websiteUrl: skillSubmission.websiteUrl,
      locale: skillSubmission.locale,
      accountId: skillSubmission.accountId,
      userEmail: user.email,
      userName: user.name,
    })
    .from(skillSubmission)
    .leftJoin(user, eq(user.id, skillSubmission.accountId))
    .where(eq(skillSubmission.status, "publishing"))
    .limit(100)

  let completed = 0
  for (const submission of candidates) {
    const rows = await db
      .select({
        status: skillPublication.status,
        externalUrl: skillPublication.externalUrl,
      })
      .from(skillPublication)
      .where(eq(skillPublication.submissionId, submission.id))

    const complete = rows.length > 0 && rows.every((publication) => publication.status === "sent")
    if (!complete) continue

    const [updated] = await db
      .update(skillSubmission)
      .set({ status: "completed", updatedAt: now })
      .where(and(eq(skillSubmission.id, submission.id), eq(skillSubmission.status, "publishing")))
      .returning({ id: skillSubmission.id })

    if (!updated) continue
    completed++

    const urls = rows
      .map((publication) => publication.externalUrl)
      .filter((url): url is string => !!url)
    if (submission.userEmail) {
      try {
        const statusUrl = buildSkillStatusUrl(resolveAppUrl(), submission.id, submission.locale)
        await sendSkillSubmissionCompletedEmail({
          userEmail: submission.userEmail,
          userName: submission.userName,
          projectName: submission.domain,
          locale: submission.locale,
          urls,
          statusUrl,
        })
      } catch (error) {
        console.error("[skill-publish] completion email failed:", submission.id, error)
      }
    }
  }

  return completed
}

function dateOnlyUtc(date: Date): string {
  return date.toISOString().slice(0, 10)
}
