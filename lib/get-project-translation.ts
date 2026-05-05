import { db } from "@/drizzle/db"
import { project, projectTranslation } from "@/drizzle/db/schema"
import { and, eq, inArray } from "drizzle-orm"

/**
 * Resolve the description to display for a given (projectId, locale).
 *
 * Fallback order:
 *   1. Exact locale match
 *   2. Source-locale row (`is_source = true`)
 *   3. English row (most common ground truth)
 *   4. Any available row
 *   5. The bare project.description string passed in (last resort)
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
 * Bulk: fetch the English description for a list of projects, with source/
 * project-table fallback. Used by English-only cron jobs (comparison /
 * alternatives content generation) so they always feed English text to the AI.
 */
export async function getEnglishDescriptions(
  projectIds: string[],
): Promise<Record<string, string>> {
  if (projectIds.length === 0) return {}

  const result: Record<string, string> = {}

  // Pass 1: try locale=en
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

  const stillMissing = projectIds.filter((id) => !(id in result))
  if (stillMissing.length === 0) return result

  // Pass 2: source rows for projects without an en translation yet
  const sourceRows = await db
    .select({
      projectId: projectTranslation.projectId,
      description: projectTranslation.description,
    })
    .from(projectTranslation)
    .where(
      and(
        inArray(projectTranslation.projectId, stillMissing),
        eq(projectTranslation.isSource, true),
      ),
    )
  for (const r of sourceRows) {
    if (!(r.projectId in result)) result[r.projectId] = r.description
  }

  const stillMissing2 = projectIds.filter((id) => !(id in result))
  if (stillMissing2.length === 0) return result

  // Pass 3: bare project.description as last resort
  const bareRows = await db
    .select({ id: project.id, description: project.description })
    .from(project)
    .where(inArray(project.id, stillMissing2))
  for (const r of bareRows) {
    if (!(r.id in result)) result[r.id] = r.description
  }

  return result
}
