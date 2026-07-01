import { db } from "@/drizzle/db"
import {
  skillPublication,
  skillSubmission,
  skillSubmissionVariant,
  verifiedDomain,
} from "@/drizzle/db/schema"
import { routing } from "@/i18n/routing"
import { and, asc, eq, gte, isNotNull, sql } from "drizzle-orm"
import * as z from "zod"

import { countInt } from "@/lib/db-utils"
import {
  clearDedupe,
  dedupeOnce,
  releaseRateLimitSlot,
  reserveRateLimitSlot,
  type RateLimitReservationResult,
} from "@/lib/rate-limit"
import { normalizeSkillDomain } from "@/lib/skill-domains"
import {
  isSkillReviewRejected,
  reviewSkillSubmission,
  type SkillReviewVerdict,
} from "@/lib/skill-review"
import { checkSkillVariantSimilarity, type SkillSimilarityResult } from "@/lib/skill-similarity"
import {
  buildSkillPublicationSchedule,
  SKILL_PUBLICATION_SITE_COUNT,
  skillPublicationSites,
  type SkillPublicationScheduleRow,
} from "@/lib/skill-sites"
import { isPrivateHostname } from "@/lib/utils"

export const SKILL_MONTHLY_QUOTA = 3
export const SKILL_MONTHLY_QUOTA_WINDOW_MS = 30 * 24 * 60 * 60 * 1000
export const SKILL_QUOTA_RESERVATION_TTL_MS = 5 * 60 * 1000
export const SKILL_DOMAIN_PENDING_LOCK_TTL_SECONDS = 15 * 60

const skillSubmitVariantSchema = z
  .object({
    site: z.string().trim().min(1).max(120),
    title: z.string().trim().min(1).max(180),
    tagline: z.string().trim().min(1).max(280),
    lang: z.string().trim().min(2).max(16),
    bodyMd: z.string().trim().min(1).max(20_000).optional(),
    body_md: z.string().trim().min(1).max(20_000).optional(),
  })
  .transform((value, ctx) => {
    const bodyMd = value.bodyMd ?? value.body_md
    if (!bodyMd) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["bodyMd"],
        message: "Required",
      })
      return z.NEVER
    }

    return {
      site: value.site,
      title: value.title,
      tagline: value.tagline,
      lang: value.lang,
      bodyMd,
    }
  })

export const skillSubmitRequestSchema = z
  .object({
    domain: z.string().trim().min(1).max(2048),
    websiteUrl: z.string().trim().url().max(2048).optional(),
    website_url: z.string().trim().url().max(2048).optional(),
    variants: z.array(skillSubmitVariantSchema).length(SKILL_PUBLICATION_SITE_COUNT),
    tosAccepted: z.literal(true),
    locale: z.string().trim().min(2).max(16).optional(),
  })
  .transform((value, ctx) => {
    const websiteUrl = value.websiteUrl ?? value.website_url
    if (!websiteUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["websiteUrl"],
        message: "Required",
      })
      return z.NEVER
    }

    return {
      domain: value.domain,
      websiteUrl,
      variants: value.variants,
      tosAccepted: value.tosAccepted,
      locale: normalizeLocale(value.locale),
    }
  })

export type SkillSubmitInput = z.infer<typeof skillSubmitRequestSchema>
export type SkillSubmitVariant = SkillSubmitInput["variants"][number]

export type SkillSubmitErrorCode =
  | "invalid_domain"
  | "invalid_website_url"
  | "website_domain_mismatch"
  | "domain_not_verified"
  | "invalid_sites"
  | "similarity_rejected"
  | "monthly_quota_exceeded"
  | "domain_already_submitted"
  | "review_unavailable"
  | "site_config_error"

export type SkillSubmissionStatus = "rejected" | "publishing"

export type SkillSubmitResult =
  | {
      ok: true
      uuid: string
      status: SkillSubmissionStatus
      reviewScore: number
      reviewReasons: string[]
    }
  | {
      ok: false
      httpStatus: number
      code: SkillSubmitErrorCode
      error: string
      reset?: number
      similarity?: SkillSimilarityResult
    }

export interface PersistSkillSubmissionInput {
  accountId: string
  domain: string
  websiteUrl: string
  locale: string
  status: SkillSubmissionStatus
  review: SkillReviewVerdict
  variants: readonly SkillSubmitVariant[]
  schedule: readonly SkillPublicationScheduleRow[]
  now: Date
}

export interface SkillSubmitDependencies {
  now(): Date
  targetSites(now: Date): SkillPublicationScheduleRow[]
  findVerifiedDomain(accountId: string, domain: string): Promise<boolean>
  findExistingSubmission(domain: string): Promise<{ id: string; status: string } | null>
  checkQuota(accountId: string, now: Date): Promise<RateLimitReservationResult>
  releaseQuotaReservation(accountId: string, token: string): Promise<void>
  reserveDomain(domain: string): Promise<boolean>
  releaseDomainReservation(domain: string): Promise<void>
  review(input: {
    domain: string
    websiteUrl: string
    variants: readonly SkillSubmitVariant[]
  }): Promise<SkillReviewVerdict>
  persist(
    input: PersistSkillSubmissionInput,
  ): Promise<{ id: string; status: SkillSubmissionStatus }>
}

const defaultSkillSubmitDependencies: SkillSubmitDependencies = {
  now: () => new Date(),
  targetSites: (now) => buildSkillPublicationSchedule(now, skillPublicationSites()),
  findVerifiedDomain: findVerifiedSkillDomain,
  findExistingSubmission,
  checkQuota: checkMonthlyQuota,
  releaseQuotaReservation: releaseMonthlyQuotaReservation,
  reserveDomain: reserveSkillDomain,
  releaseDomainReservation: releaseSkillDomainReservation,
  review: reviewSkillSubmission,
  persist: persistSkillSubmission,
}

export async function submitSkillSubmission(
  accountId: string,
  input: SkillSubmitInput,
  deps: SkillSubmitDependencies = defaultSkillSubmitDependencies,
): Promise<SkillSubmitResult> {
  const now = deps.now()
  const domain = normalizeSkillDomain(input.domain)
  if (!domain) {
    return { ok: false, httpStatus: 400, code: "invalid_domain", error: "Invalid domain" }
  }

  const websiteUrl = normalizeSkillWebsiteUrl(input.websiteUrl)
  if (!websiteUrl) {
    return {
      ok: false,
      httpStatus: 400,
      code: "invalid_website_url",
      error: "Invalid website URL",
    }
  }

  const websiteDomain = normalizeSkillDomain(websiteUrl)
  if (websiteDomain !== domain) {
    return {
      ok: false,
      httpStatus: 400,
      code: "website_domain_mismatch",
      error: "websiteUrl must use the verified domain",
    }
  }

  let schedule: SkillPublicationScheduleRow[]
  try {
    schedule = deps.targetSites(now)
  } catch (error) {
    console.error("[skill-submit] site schedule failed:", error)
    return {
      ok: false,
      httpStatus: 500,
      code: "site_config_error",
      error: "Skill publication sites are not configured correctly",
    }
  }

  const siteValidation = validateVariantSites(
    input.variants,
    schedule.map((site) => site.site),
  )
  if (siteValidation) {
    return { ok: false, httpStatus: 400, code: "invalid_sites", error: siteValidation }
  }

  const verified = await deps.findVerifiedDomain(accountId, domain)
  if (!verified) {
    return {
      ok: false,
      httpStatus: 403,
      code: "domain_not_verified",
      error: "Domain has not been verified for this account",
    }
  }

  const orderedVariants = orderVariantsBySchedule(input.variants, schedule)
  const similarity = checkSkillVariantSimilarity(orderedVariants)
  if (!similarity.ok) {
    return {
      ok: false,
      httpStatus: 422,
      code: "similarity_rejected",
      error: "Variants are too similar. Generate more differentiated copy.",
      similarity,
    }
  }

  const existing = await deps.findExistingSubmission(domain)
  if (existing) {
    return {
      ok: false,
      httpStatus: 409,
      code: "domain_already_submitted",
      error: "This domain has already used the free skill submission channel",
    }
  }

  const reserved = await deps.reserveDomain(domain)
  if (!reserved) {
    return {
      ok: false,
      httpStatus: 409,
      code: "domain_already_submitted",
      error: "This domain has already used the free skill submission channel",
    }
  }

  let quotaReservationToken: string | undefined
  async function releaseQuotaReservation() {
    if (!quotaReservationToken) return

    const token = quotaReservationToken
    quotaReservationToken = undefined
    try {
      await deps.releaseQuotaReservation(accountId, token)
    } catch (error) {
      console.error("[skill-submit] quota reservation release failed:", error)
    }
  }

  try {
    const quota = await deps.checkQuota(accountId, now)
    if (!quota.success) {
      await deps.releaseDomainReservation(domain)
      return {
        ok: false,
        httpStatus: 429,
        code: "monthly_quota_exceeded",
        error: "Monthly free skill submission quota exceeded",
        reset: quota.reset,
      }
    }
    quotaReservationToken = quota.token

    const review = await deps.review({ domain, websiteUrl, variants: orderedVariants })
    const status: SkillSubmissionStatus = isSkillReviewRejected(review) ? "rejected" : "publishing"
    const saved = await deps.persist({
      accountId,
      domain,
      websiteUrl,
      locale: input.locale,
      status,
      review,
      variants: status === "publishing" ? orderedVariants : [],
      schedule,
      now,
    })
    await releaseQuotaReservation()

    return {
      ok: true,
      uuid: saved.id,
      status: saved.status,
      reviewScore: review.score,
      reviewReasons: review.reasons,
    }
  } catch (error) {
    await releaseQuotaReservation()

    if (error instanceof SkillMonthlyQuotaExceededError) {
      await deps.releaseDomainReservation(domain)
      return {
        ok: false,
        httpStatus: 429,
        code: "monthly_quota_exceeded",
        error: "Monthly free skill submission quota exceeded",
        reset: error.reset,
      }
    }

    if (isUniqueViolation(error)) {
      return {
        ok: false,
        httpStatus: 409,
        code: "domain_already_submitted",
        error: "This domain has already used the free skill submission channel",
      }
    }

    await deps.releaseDomainReservation(domain)
    console.error("[skill-submit] automated review or persistence failed:", error)
    return {
      ok: false,
      httpStatus: 503,
      code: "review_unavailable",
      error: "Automated review is temporarily unavailable. Please try again later.",
    }
  }
}

function isUniqueViolation(error: unknown): boolean {
  if (typeof error === "object" && error !== null) {
    const code =
      (error as { code?: unknown }).code ?? (error as { cause?: { code?: unknown } }).cause?.code
    if (code === "23505") return true
  }

  return error instanceof Error && /duplicate key value|unique constraint/i.test(error.message)
}

export function buildSkillStatusUrl(
  origin: string,
  uuid: string,
  locale: string | undefined = routing.defaultLocale,
) {
  const normalizedLocale = normalizeLocale(locale)
  const prefix = normalizedLocale === routing.defaultLocale ? "" : `/${normalizedLocale}`
  return `${origin.replace(/\/+$/, "")}${prefix}/s/${uuid}`
}

function normalizeSkillWebsiteUrl(input: string): string | null {
  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    return null
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return null
  if (url.username || url.password) return null
  const hostname = url.hostname.replace(/\.$/, "").toLowerCase()
  if (!hostname || isPrivateHostname(hostname)) return null

  url.hostname = hostname
  url.hash = ""
  return url.toString()
}

function validateVariantSites(
  variants: readonly SkillSubmitVariant[],
  expectedSites: readonly string[],
): string | null {
  const expected = new Set(expectedSites)
  const seen = new Set<string>()

  for (const variant of variants) {
    if (!expected.has(variant.site)) {
      return `Unknown skill publication site: ${variant.site}`
    }
    if (seen.has(variant.site)) {
      return `Duplicate skill publication site: ${variant.site}`
    }
    seen.add(variant.site)
  }

  const missing = expectedSites.filter((site) => !seen.has(site))
  if (missing.length > 0) {
    return `Missing skill publication sites: ${missing.join(", ")}`
  }

  return null
}

function orderVariantsBySchedule(
  variants: readonly SkillSubmitVariant[],
  schedule: readonly SkillPublicationScheduleRow[],
): SkillSubmitVariant[] {
  const bySite = new Map(variants.map((variant) => [variant.site, variant]))
  return schedule.map((row) => {
    const variant = bySite.get(row.site)
    if (!variant) throw new Error(`missing variant for ${row.site}`)
    return variant
  })
}

function normalizeLocale(locale: string | undefined): string {
  return locale && (routing.locales as readonly string[]).includes(locale)
    ? locale
    : routing.defaultLocale
}

async function findVerifiedSkillDomain(accountId: string, domain: string): Promise<boolean> {
  const [row] = await db
    .select({ id: verifiedDomain.id })
    .from(verifiedDomain)
    .where(
      and(
        eq(verifiedDomain.accountId, accountId),
        eq(verifiedDomain.domain, domain),
        isNotNull(verifiedDomain.verifiedAt),
      ),
    )
    .limit(1)

  return Boolean(row)
}

async function findExistingSubmission(
  domain: string,
): Promise<{ id: string; status: string } | null> {
  const [row] = await db
    .select({ id: skillSubmission.id, status: skillSubmission.status })
    .from(skillSubmission)
    .where(eq(skillSubmission.domain, domain))
    .limit(1)

  return row ?? null
}

async function checkMonthlyQuota(
  accountId: string,
  now: Date,
): Promise<RateLimitReservationResult> {
  const windowStart = skillMonthlyQuotaWindowStart(now)
  const [row] = await db
    .select({ total: countInt() })
    .from(skillSubmission)
    .where(
      and(eq(skillSubmission.accountId, accountId), gte(skillSubmission.createdAt, windowStart)),
    )

  const total = row?.total ?? 0
  if (total >= SKILL_MONTHLY_QUOTA) {
    const [oldest] = await db
      .select({ createdAt: skillSubmission.createdAt })
      .from(skillSubmission)
      .where(
        and(eq(skillSubmission.accountId, accountId), gte(skillSubmission.createdAt, windowStart)),
      )
      .orderBy(asc(skillSubmission.createdAt))
      .limit(1)

    return {
      success: false,
      remaining: 0,
      reset: skillMonthlyQuotaResetSeconds(now, oldest?.createdAt),
    }
  }

  return reserveRateLimitSlot(
    `skill-quota:${accountId}`,
    SKILL_MONTHLY_QUOTA,
    total,
    SKILL_QUOTA_RESERVATION_TTL_MS,
  )
}

function releaseMonthlyQuotaReservation(accountId: string, token: string): Promise<void> {
  return releaseRateLimitSlot(`skill-quota:${accountId}`, token)
}

function reserveSkillDomain(domain: string): Promise<boolean> {
  return dedupeOnce(`skill-domain-pending:${domain}`, SKILL_DOMAIN_PENDING_LOCK_TTL_SECONDS)
}

function releaseSkillDomainReservation(domain: string): Promise<void> {
  return clearDedupe(`skill-domain-pending:${domain}`)
}

async function persistSkillSubmission(
  input: PersistSkillSubmissionInput,
): Promise<{ id: string; status: SkillSubmissionStatus }> {
  const reviewReason = input.review.reasons.join("; ").slice(0, 1000)

  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`skill-quota:${input.accountId}`}))`,
    )

    const windowStart = skillMonthlyQuotaWindowStart(input.now)
    const [quota] = await tx
      .select({ total: countInt() })
      .from(skillSubmission)
      .where(
        and(
          eq(skillSubmission.accountId, input.accountId),
          gte(skillSubmission.createdAt, windowStart),
        ),
      )

    if ((quota?.total ?? 0) >= SKILL_MONTHLY_QUOTA) {
      const [oldest] = await tx
        .select({ createdAt: skillSubmission.createdAt })
        .from(skillSubmission)
        .where(
          and(
            eq(skillSubmission.accountId, input.accountId),
            gte(skillSubmission.createdAt, windowStart),
          ),
        )
        .orderBy(asc(skillSubmission.createdAt))
        .limit(1)

      throw new SkillMonthlyQuotaExceededError(
        skillMonthlyQuotaResetSeconds(input.now, oldest?.createdAt),
      )
    }

    const [submission] = await tx
      .insert(skillSubmission)
      .values({
        accountId: input.accountId,
        domain: input.domain,
        websiteUrl: input.websiteUrl,
        status: input.status,
        reviewScore: input.review.score,
        reviewReason,
        locale: input.locale,
        tosAcceptedAt: input.now,
        createdAt: input.now,
        updatedAt: input.now,
      })
      .returning({ id: skillSubmission.id, status: skillSubmission.status })

    if (!submission) throw new Error("skill_submission insert returned no row")

    if (input.status === "publishing") {
      await tx
        .insert(skillSubmissionVariant)
        .values(
          input.variants.map((variant) => ({
            submissionId: submission.id,
            site: variant.site,
            title: variant.title,
            tagline: variant.tagline,
            bodyMd: variant.bodyMd,
            lang: variant.lang,
          })),
        )
        .onConflictDoNothing()

      await tx
        .insert(skillPublication)
        .values(
          input.schedule.map((row) => ({
            submissionId: submission.id,
            site: row.site,
            rel: "nofollow",
            batchDay: row.batchDay,
            scheduledFor: row.scheduledFor,
            status: "scheduled",
            attempts: 0,
            createdAt: input.now,
            updatedAt: input.now,
          })),
        )
        .onConflictDoNothing()
    }

    return {
      id: submission.id,
      status: submission.status as SkillSubmissionStatus,
    }
  })
}

function skillMonthlyQuotaWindowStart(now: Date): Date {
  return new Date(now.getTime() - SKILL_MONTHLY_QUOTA_WINDOW_MS)
}

function skillMonthlyQuotaResetSeconds(now: Date, oldestCreatedAt: Date | undefined): number {
  const resetAt =
    oldestCreatedAt !== undefined
      ? oldestCreatedAt.getTime() + SKILL_MONTHLY_QUOTA_WINDOW_MS
      : now.getTime() + SKILL_MONTHLY_QUOTA_WINDOW_MS
  return Math.max(1, Math.ceil((resetAt - now.getTime()) / 1000))
}

export class SkillMonthlyQuotaExceededError extends Error {
  constructor(readonly reset: number) {
    super("Monthly free skill submission quota exceeded")
    this.name = "SkillMonthlyQuotaExceededError"
  }
}
