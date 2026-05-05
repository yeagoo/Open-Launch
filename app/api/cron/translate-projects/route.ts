import { NextRequest, NextResponse } from "next/server"

import { db } from "@/drizzle/db"
import { project, projectTranslation } from "@/drizzle/db/schema"
import { eq, sql } from "drizzle-orm"

import { verifyCronAuth } from "@/lib/cron-auth"
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

  // Find projects with missing AI translations.
  // We compare the count of translation rows against the number of locales (8).
  const candidates = await db
    .select({
      projectId: project.id,
      sourceLocale: project.sourceLocale,
    })
    .from(project)
    .where(
      sql`(
        SELECT COUNT(*) FROM ${projectTranslation}
        WHERE ${projectTranslation.projectId} = ${project.id}
      ) < ${ALL_LOCALES.length}`,
    )
    .limit(MAX_PROJECTS_PER_RUN)

  let translated = 0
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

    // Fetch the source description to feed the translator
    const [sourceRow] = await db
      .select({ description: projectTranslation.description })
      .from(projectTranslation)
      .where(eq(projectTranslation.projectId, projectId))
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
        await db
          .insert(projectTranslation)
          .values({
            projectId,
            locale: targetLocale,
            description,
            isSource: false,
            aiGenerated: true,
          })
          .onConflictDoNothing({
            target: [projectTranslation.projectId, projectTranslation.locale],
          })
        translated++
      } catch (err) {
        failed++
        errors.push(`${projectId} -> ${targetLocale}: ${err instanceof Error ? err.message : err}`)
      }
    }
  }

  return NextResponse.json({
    candidates: candidates.length,
    translated,
    failed,
    errors: errors.slice(0, 10),
  })
}
