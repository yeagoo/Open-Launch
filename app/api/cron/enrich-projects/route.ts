import { NextRequest, NextResponse } from "next/server"

import { db } from "@/drizzle/db"
import { project, projectTranslation } from "@/drizzle/db/schema"
import { and, asc, eq, isNull, or, sql } from "drizzle-orm"

import { getCachedOrCrawl } from "@/lib/crawl4ai"
import { CrawlError } from "@/lib/crawler-types"
import { verifyCronAuth } from "@/lib/cron-auth"
import { cronStatusFromResult } from "@/lib/cron-status"
import { generateLongDescription } from "@/lib/enrich-project"

export const dynamic = "force-dynamic"
export const maxDuration = 120

const MAX_PROJECTS_PER_RUN = 3
// How long to skip a project after a failed attempt. Without this, the
// cron's LIMIT 3 (no ORDER BY) returned the same 3 broken URLs on every
// tick — observed in prod as a 7% success rate on 267 attempts/24h that
// were really 89 attempts × 3 same projects.
const RETRY_COOLDOWN_HOURS = 24
// After this many consecutive failures, stop retrying entirely — flag
// the project as low-quality so every AI cron skips it.
const MAX_FAILURES_BEFORE_GIVING_UP = 3

// Tinyfish per-URL errors that aren't worth retrying for. SPA loaded
// without text content / malformed URL won't fix themselves on a 24h
// retry; mark low-quality immediately to free the candidate pool.
//
// CONTRACT: detection below relies on the literal string format
//   `Tinyfish per-URL error: ${code}`
// that lib/tinyfish.ts produces inside CrawlError.message. If you ever
// change the throw wording there, update both this list and the
// `msg.includes(...)` substring in the catch block. A structured
// `code` field on CrawlError would remove the coupling but isn't
// worth the refactor for two error types.
const FATAL_TINYFISH_ERRORS = ["invalid_url", "empty_content"]

/**
 * Generate the canonical (English) long_description for projects whose EN
 * project_translation row exists but whose `long_description` column is still
 * NULL. Crawls the project websiteUrl via Tinyfish, asks DeepSeek for a
 * 450–550 word markdown overview, writes the result.
 *
 * Other locales' long_description is filled later by the translate-projects
 * cron — this endpoint only ever writes to the EN row.
 *
 * Failure handling:
 *   - Every attempt stamps `long_description_attempted_at` so the same
 *     project doesn't reappear in the next tick's candidate pool.
 *   - Fatal Tinyfish errors (invalid_url, empty_content) → flip the
 *     project to is_low_quality immediately.
 *   - After 3 consecutive failures of any kind → also flip is_low_quality.
 *   - Otherwise the project re-enters the pool 24h later for a retry
 *     (sites can come back online).
 */
export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request)
  if (authError) return authError

  const cooldownCutoff = new Date(Date.now() - RETRY_COOLDOWN_HOURS * 60 * 60 * 1000)

  const candidates = await db
    .select({
      projectId: project.id,
      name: project.name,
      websiteUrl: project.websiteUrl,
      shortDescription: projectTranslation.description,
    })
    .from(project)
    .innerJoin(
      projectTranslation,
      and(
        eq(projectTranslation.projectId, project.id),
        eq(projectTranslation.locale, "en"),
        isNull(projectTranslation.longDescription),
      ),
    )
    .where(
      and(
        sql`${project.websiteUrl} IS NOT NULL AND length(${project.websiteUrl}) > 0`,
        eq(project.isLowQuality, false),
        // Skip projects we've attempted in the last 24h. Brand new
        // candidates (attempted_at IS NULL) are always eligible.
        or(
          isNull(projectTranslation.longDescriptionAttemptedAt),
          sql`${projectTranslation.longDescriptionAttemptedAt} < ${cooldownCutoff}`,
        ),
      ),
    )
    // Ascending by attempted_at means: never-tried first (NULL sorts
    // last under ASC by default in PG, so use NULLS FIRST), then the
    // oldest cooled-down rows. Predictable rotation through the entire
    // backlog.
    .orderBy(sql`${projectTranslation.longDescriptionAttemptedAt} ASC NULLS FIRST`, asc(project.id))
    .limit(MAX_PROJECTS_PER_RUN)

  let generated = 0
  let stale = 0
  let failed = 0
  let markedLowQuality = 0
  const errors: string[] = []

  for (const cand of candidates) {
    if (!cand.websiteUrl) continue
    try {
      const crawl = await getCachedOrCrawl(cand.projectId, cand.websiteUrl, 7, { timeout: 60000 })
      const longDescription = await generateLongDescription({
        name: cand.name,
        shortDescription: cand.shortDescription || "",
        crawledMarkdown: crawl.markdown || "",
      })

      // CAS write: only persist if the EN row still has the same short
      // description we fed to the AI and long_description is still null.
      // Comparing on `description` (string) instead of `updated_at` avoids
      // PG-microsecond / JS-millisecond truncation false-mismatches.
      const result = await db
        .update(projectTranslation)
        .set({
          longDescription,
          longDescriptionGeneratedAt: new Date(),
          longDescriptionAttemptedAt: new Date(),
          // Successful generation → reset attempt counter so future
          // re-generations (if anyone clears long_description) start
          // fresh.
          longDescriptionAttemptCount: 0,
          longDescriptionLastError: null,
        })
        .where(
          and(
            eq(projectTranslation.projectId, cand.projectId),
            eq(projectTranslation.locale, "en"),
            isNull(projectTranslation.longDescription),
            eq(projectTranslation.description, cand.shortDescription),
          ),
        )
      const affected = (result as unknown as { rowCount?: number }).rowCount
      if (affected === 0) {
        stale++
        // Stamp attempted_at anyway so this stale candidate doesn't
        // come back next tick.
        await db
          .update(projectTranslation)
          .set({ longDescriptionAttemptedAt: new Date() })
          .where(
            and(
              eq(projectTranslation.projectId, cand.projectId),
              eq(projectTranslation.locale, "en"),
            ),
          )
      } else {
        generated++
      }
    } catch (err) {
      failed++
      const msg = err instanceof Error ? err.message : String(err)
      errors.push(`${cand.projectId}: ${msg}`)

      // Categorize the failure. Tinyfish "invalid_url" / "empty_content"
      // are unrecoverable — the URL is malformed or the site is a JS
      // SPA we can't render. Anything else gets the cooldown treatment.
      const isFatal =
        err instanceof CrawlError &&
        FATAL_TINYFISH_ERRORS.some((code) => msg.includes(`per-URL error: ${code}`))

      // Stamp attempt + bump count atomically, return new count so we
      // can decide whether to also flip low_quality.
      const [updated] = await db
        .update(projectTranslation)
        .set({
          longDescriptionAttemptedAt: new Date(),
          longDescriptionAttemptCount: sql`${projectTranslation.longDescriptionAttemptCount} + 1`,
          longDescriptionLastError: msg.slice(0, 500),
        })
        .where(
          and(
            eq(projectTranslation.projectId, cand.projectId),
            eq(projectTranslation.locale, "en"),
          ),
        )
        .returning({ count: projectTranslation.longDescriptionAttemptCount })

      const totalFailures = updated?.count ?? 0
      if (isFatal || totalFailures >= MAX_FAILURES_BEFORE_GIVING_UP) {
        await db.update(project).set({ isLowQuality: true }).where(eq(project.id, cand.projectId))
        markedLowQuality++
        console.warn(
          `🚫 Marked "${cand.name}" low_quality: ${isFatal ? "fatal Tinyfish error" : `${totalFailures} consecutive failures`}`,
        )
      }
    }
  }

  const status = cronStatusFromResult({ errorCount: errors.length, successCount: generated })
  return NextResponse.json(
    {
      candidates: candidates.length,
      generated,
      stale,
      failed,
      markedLowQuality,
      errors: errors.slice(0, 10),
    },
    { status },
  )
}
