import { db } from "@/drizzle/db"
import { projectTranslation } from "@/drizzle/db/schema"
import { and, eq, inArray } from "drizzle-orm"

/**
 * Resolve the description to display for a given (projectId, locale).
 *
 * Fallback order:
 *   1. Exact locale match (project_translation row for this locale)
 *   2. Source-locale row (`is_source = true`)
 *   3. English row (most common ground truth)
 *   4. The bare `fallback` string passed in (last resort, usually project.description)
 */
export async function getLocalizedProjectDescription(
  projectId: string,
  locale: string,
  fallback: string,
): Promise<string> {
  const rows = await db
    .select({
      locale: projectTranslation.locale,
      description: projectTranslation.description,
      isSource: projectTranslation.isSource,
    })
    .from(projectTranslation)
    .where(
      and(
        eq(projectTranslation.projectId, projectId),
        inArray(projectTranslation.locale, [locale, "en"]),
      ),
    )

  const exact = rows.find((r) => r.locale === locale)
  if (exact) return exact.description

  // Try the source row (one extra query when locale != en and source != en)
  const [source] = await db
    .select({ description: projectTranslation.description })
    .from(projectTranslation)
    .where(and(eq(projectTranslation.projectId, projectId), eq(projectTranslation.isSource, true)))
    .limit(1)
  if (source) return source.description

  const en = rows.find((r) => r.locale === "en")
  if (en) return en.description

  return fallback
}

/**
 * Bulk: fetch the canonical English description for a list of projects.
 *
 * Strict: returns ONLY rows where an actual `locale='en'` translation exists.
 * Projects whose English translation hasn't been generated yet are simply
 * absent from the returned record. Callers (English-only AI crons) must
 * either skip such projects or call again after the translate-projects cron
 * has had a chance to fill them in.
 */
export async function getEnglishDescriptions(
  projectIds: string[],
): Promise<Record<string, string>> {
  if (projectIds.length === 0) return {}

  const result: Record<string, string> = {}

  const enRows = await db
    .select({
      projectId: projectTranslation.projectId,
      description: projectTranslation.description,
    })
    .from(projectTranslation)
    .where(
      and(inArray(projectTranslation.projectId, projectIds), eq(projectTranslation.locale, "en")),
    )
  for (const r of enRows) result[r.projectId] = r.description

  return result
}
