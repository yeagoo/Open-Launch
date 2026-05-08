import { NextRequest, NextResponse } from "next/server"

import { db } from "@/drizzle/db"
import { project } from "@/drizzle/db/schema"
import { eq, isNull, lt, or, sql } from "drizzle-orm"

import { classifyProjectQuality } from "@/lib/ai-quality"
import { verifyCronAuth } from "@/lib/cron-auth"
import { cronStatusFromResult } from "@/lib/cron-status"

export const dynamic = "force-dynamic"
export const maxDuration = 90

const MAX_PROJECTS_PER_RUN = 3
// Re-classify projects whose check is older than this. Kept long because
// the underlying description rarely changes; updateProject also clears
// `quality_checked_at` directly when the description is edited.
const RECHECK_DAYS = 30

/**
 * Walk through projects that have never been classified (or whose last
 * verdict has aged out) and run them through the AI quality classifier.
 * Low scores ( < LOW_QUALITY_THRESHOLD) flip `is_low_quality = true` and
 * exclude the project from every other AI feature on the site.
 */
export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request)
  if (authError) return authError

  const cutoff = new Date(Date.now() - RECHECK_DAYS * 24 * 60 * 60 * 1000)

  const candidates = await db
    .select({
      id: project.id,
      name: project.name,
      description: project.description,
      websiteUrl: project.websiteUrl,
    })
    .from(project)
    .where(or(isNull(project.qualityCheckedAt), lt(project.qualityCheckedAt, cutoff)))
    .orderBy(sql`${project.qualityCheckedAt} ASC NULLS FIRST`)
    .limit(MAX_PROJECTS_PER_RUN)

  let checked = 0
  let flagged = 0
  const errors: string[] = []

  for (const cand of candidates) {
    try {
      const verdict = await classifyProjectQuality({
        name: cand.name,
        description: cand.description,
        websiteUrl: cand.websiteUrl,
      })
      await db
        .update(project)
        .set({
          isLowQuality: verdict.isLowQuality,
          qualityScore: verdict.score,
          qualityReason: verdict.reason,
          qualityCheckedAt: new Date(),
        })
        .where(eq(project.id, cand.id))
      checked++
      if (verdict.isLowQuality) flagged++
    } catch (err) {
      errors.push(`${cand.id}: ${err instanceof Error ? err.message : err}`)
    }
  }

  const status = cronStatusFromResult({ errorCount: errors.length, successCount: checked })
  return NextResponse.json(
    {
      candidates: candidates.length,
      checked,
      flagged,
      errors: errors.slice(0, 10),
    },
    { status },
  )
}
