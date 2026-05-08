import { NextRequest, NextResponse } from "next/server"

import { db } from "@/drizzle/db"
import { project, projectTranslation } from "@/drizzle/db/schema"
import { and, eq, sql } from "drizzle-orm"

import { verifyCronAuth } from "@/lib/cron-auth"
import { cronStatusFromResult } from "@/lib/cron-status"
import { translateLongDescription } from "@/lib/enrich-project"
import { translateProjectDescription, type ProjectLocale } from "@/lib/translate-project"

const ALL_LOCALES: ProjectLocale[] = ["en", "zh", "es", "pt", "fr", "ja", "ko", "et"]
const MAX_PROJECTS_PER_RUN = 5

export const dynamic = "force-dynamic"
export const maxDuration = 90

/**
 * Find up to MAX_PROJECTS_PER_RUN projects that are missing one or more
 * non-source-locale translations and fill them in via DeepSeek.
 *
 * Each invocation works in small batches so a single failed call doesn't
 * starve other projects. Failed locales are simply retried on the next run.
 */
export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request)
  if (authError) return authError

  // Find projects that need either:
  //   (a) any missing locale row (count < 8), OR
  //   (b) a non-EN locale row whose long_description is NULL while the EN row's
  //       long_description has been filled by the enrich-projects cron.
  const candidates = await db
    .select({
      projectId: project.id,
      sourceLocale: project.sourceLocale,
    })
    .from(project)
    .where(
      sql`${project.isLowQuality} = false
        AND ((
          SELECT COUNT(*) FROM ${projectTranslation}
          WHERE ${projectTranslation.projectId} = ${project.id}
        ) < ${ALL_LOCALES.length}
        OR EXISTS (
          SELECT 1
          FROM ${projectTranslation} en_t
          JOIN ${projectTranslation} other_t
            ON other_t.project_id = en_t.project_id
          WHERE en_t.project_id = ${project.id}
            AND en_t.locale = 'en'
            AND en_t.long_description IS NOT NULL
            AND other_t.locale <> 'en'
            AND other_t.long_description IS NULL
        ))`,
    )
    .limit(MAX_PROJECTS_PER_RUN)

  let translated = 0
  let longTranslated = 0
  let failed = 0
  const errors: string[] = []

  for (const cand of candidates) {
    const projectId = cand.projectId
    const sourceLocale = (cand.sourceLocale || "en") as ProjectLocale

    // Load the source translation row (this is the canonical input)
    const [src] = await db
      .select({ description: projectTranslation.description })
      .from(projectTranslation)
      .where(eq(projectTranslation.projectId, projectId))
      .limit(1)

    if (!src) {
      // No source row yet — backfill from project.description first
      const [proj] = await db
        .select({ description: project.description })
        .from(project)
        .where(eq(project.id, projectId))
        .limit(1)
      if (!proj) continue
      try {
        await db.insert(projectTranslation).values({
          projectId,
          locale: sourceLocale,
          description: proj.description,
          isSource: true,
          aiGenerated: false,
        })
      } catch (err) {
        errors.push(`${projectId} source insert: ${err instanceof Error ? err.message : err}`)
        continue
      }
    }

    // Determine which locales still need translating
    const existing = await db
      .select({ locale: projectTranslation.locale })
      .from(projectTranslation)
      .where(eq(projectTranslation.projectId, projectId))
    const existingSet = new Set(existing.map((r) => r.locale))
    const missing = ALL_LOCALES.filter((l) => !existingSet.has(l))

    // Fetch the source description — its byte value is the CAS token. Using
    // description string equality instead of updated_at avoids the PG
    // microsecond vs JS Date millisecond precision mismatch.
    const [sourceRow] = await db
      .select({ description: projectTranslation.description })
      .from(projectTranslation)
      .where(
        and(
          eq(projectTranslation.projectId, projectId),
          eq(projectTranslation.locale, sourceLocale),
        ),
      )
      .limit(1)
    if (!sourceRow) continue
    const sourceDescription = sourceRow.description

    for (const targetLocale of missing) {
      try {
        const description = await translateProjectDescription({
          description: sourceDescription,
          sourceLocale,
          targetLocale,
        })
        // CAS-gated insert: only persist if the source description hasn't been
        // edited since we read it. INSERT ... SELECT ... WHERE EXISTS makes
        // the gate atomic with the write; ON CONFLICT covers the case where
        // another runner inserted the same locale row first.
        const result = await db.execute(sql`
          INSERT INTO ${projectTranslation}
            (project_id, locale, description, is_source, ai_generated)
          SELECT ${projectId}, ${targetLocale}, ${description}, false, true
          WHERE EXISTS (
            SELECT 1 FROM ${projectTranslation}
            WHERE project_id = ${projectId}
              AND locale = ${sourceLocale}
              AND description = ${sourceDescription}
          )
          ON CONFLICT (project_id, locale) DO NOTHING
        `)
        const affected = (result as unknown as { rowCount?: number }).rowCount
        if (affected !== 0) translated++
      } catch (err) {
        failed++
        errors.push(`${projectId} -> ${targetLocale}: ${err instanceof Error ? err.message : err}`)
      }
    }

    // Phase 2: long_description fan-out from EN canonical to other locales that
    // already have a short description but no long description yet.
    const [enRow] = await db
      .select({ longDescription: projectTranslation.longDescription })
      .from(projectTranslation)
      .where(and(eq(projectTranslation.projectId, projectId), eq(projectTranslation.locale, "en")))
      .limit(1)

    if (enRow?.longDescription) {
      const enLongDescription = enRow.longDescription
      const localeRows = await db
        .select({
          locale: projectTranslation.locale,
          longDescription: projectTranslation.longDescription,
        })
        .from(projectTranslation)
        .where(eq(projectTranslation.projectId, projectId))

      const needsLong = localeRows.filter((r) => r.locale !== "en" && !r.longDescription)

      for (const row of needsLong) {
        try {
          const longTranslation = await translateLongDescription({
            englishMarkdown: enLongDescription,
            targetLocale: row.locale as ProjectLocale,
          })
          // CAS write: only persist if (a) the target row's long_description
          // is still NULL (no concurrent runner won the race) and (b) the EN
          // canonical we translated from is byte-identical to what's stored
          // now (would differ if updateProject cleared+regenerated, or if
          // enrich-projects regenerated mid-flight). String equality avoids
          // the PG-microsecond/JS-ms timestamp precision pitfall.
          const result = await db
            .update(projectTranslation)
            .set({
              longDescription: longTranslation,
              longDescriptionGeneratedAt: new Date(),
            })
            .where(
              and(
                eq(projectTranslation.projectId, projectId),
                eq(projectTranslation.locale, row.locale),
                sql`${projectTranslation.longDescription} IS NULL`,
                sql`EXISTS (
                  SELECT 1 FROM ${projectTranslation} en_t
                  WHERE en_t.project_id = ${projectId}
                    AND en_t.locale = 'en'
                    AND en_t.long_description = ${enLongDescription}
                )`,
              ),
            )
          const affected = (result as unknown as { rowCount?: number }).rowCount
          if (affected !== 0) longTranslated++
        } catch (err) {
          failed++
          errors.push(
            `${projectId} long -> ${row.locale}: ${err instanceof Error ? err.message : err}`,
          )
        }
      }
    }
  }

  // 5xx if all writes failed but errors were recorded — surfaces a DeepSeek
  // outage to cron-job.org's email alerts.
  const status = cronStatusFromResult({
    errorCount: errors.length,
    successCount: translated + longTranslated,
  })
  return NextResponse.json(
    {
      candidates: candidates.length,
      translated,
      longTranslated,
      failed,
      errors: errors.slice(0, 10),
    },
    { status },
  )
}
