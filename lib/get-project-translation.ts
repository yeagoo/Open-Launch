import { db } from "@/drizzle/db"
import { projectTranslation } from "@/drizzle/db/schema"
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
