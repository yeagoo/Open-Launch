import { NextRequest, NextResponse } from "next/server"

import { db } from "@/drizzle/db"
import { project, projectTranslation } from "@/drizzle/db/schema"
import { and, eq, isNull, sql } from "drizzle-orm"

import { getCachedOrCrawl } from "@/lib/crawl4ai"
import { verifyCronAuth } from "@/lib/cron-auth"
import { generateLongDescription } from "@/lib/enrich-project"

export const dynamic = "force-dynamic"
export const maxDuration = 120

const MAX_PROJECTS_PER_RUN = 3

/**
 * Generate the canonical (English) long_description for projects whose EN
 * project_translation row exists but whose `long_description` column is still
 * NULL. Crawls the project websiteUrl via Crawl4AI, asks DeepSeek for a
 * 450–550 word markdown overview, writes the result.
 *
 * Other locales' long_description is filled later by the translate-projects
 * cron — this endpoint only ever writes to the EN row.
 */
export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request)
  if (authError) return authError

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
    .where(sql`${project.websiteUrl} IS NOT NULL AND length(${project.websiteUrl}) > 0`)
    .limit(MAX_PROJECTS_PER_RUN)

  let generated = 0
  let stale = 0
  let failed = 0
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
        })
        .where(
          and(
            eq(projectTranslation.projectId, cand.projectId),
            eq(projectTranslation.locale, "en"),
            isNull(projectTranslation.longDescription),
            eq(projectTranslation.description, cand.shortDescription),
          ),
        )
      // drizzle-pg returns { rowCount } via .returning() or the underlying
      // result; without .returning() we infer success by re-reading. Cheaper:
      // count as generated; conflict surfaces next tick when long_description
      // is still NULL or updatedAt advanced again.
      const affected = (result as unknown as { rowCount?: number }).rowCount
      if (affected === 0) stale++
      else generated++
    } catch (err) {
      failed++
      errors.push(`${cand.projectId}: ${err instanceof Error ? err.message : err}`)
    }
  }

  const status = errors.length > 0 && generated === 0 ? 500 : 200
  return NextResponse.json(
    {
      candidates: candidates.length,
      generated,
      stale,
      failed,
      errors: errors.slice(0, 10),
    },
    { status },
  )
}
