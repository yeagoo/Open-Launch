import { cache } from "react"

import { db } from "@/drizzle/db"
import { projectTranslation } from "@/drizzle/db/schema"
import { and, eq, inArray, or } from "drizzle-orm"

/**
 * Resolve the description to display for a given (projectId, locale).
 *
 * Fallback order:
 *   1. Exact locale match (project_translation row for this locale)
 *   2. Source-locale row (`is_source = true`)
 *   3. English row (most common ground truth)
 *   4. The bare `fallback` string passed in (last resort, usually project.description)
 *
 * Wrapped in React `cache()` because the detail page calls this
 * from `generateMetadata` and again from the page body for the
 * same args — without dedup that's 2× the DB load per render.
 */
export const getLocalizedProjectDescription = cache(
  async (projectId: string, locale: string, fallback: string): Promise<string> => {
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
      .where(
        and(eq(projectTranslation.projectId, projectId), eq(projectTranslation.isSource, true)),
      )
      .limit(1)
    if (source) return source.description

    const en = rows.find((r) => r.locale === "en")
    if (en) return en.description

    return fallback
  },
)

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

/**
 * Resolve the long-form (markdown) description to render for a given
 * (projectId, locale). Same fallback order as getLocalizedProjectDescription:
 *   1. Exact locale match  2. Source-locale row  3. EN row  4. null
 *
 * Returns null when no long_description exists yet — caller should hide the
 * "About" section instead of rendering an empty heading.
 */
export async function getLocalizedLongDescription(
  projectId: string,
  locale: string,
): Promise<string | null> {
  const rows = await db
    .select({
      locale: projectTranslation.locale,
      longDescription: projectTranslation.longDescription,
      isSource: projectTranslation.isSource,
    })
    .from(projectTranslation)
    .where(eq(projectTranslation.projectId, projectId))

  const exact = rows.find((r) => r.locale === locale && r.longDescription)
  if (exact?.longDescription) return exact.longDescription

  const source = rows.find((r) => r.isSource && r.longDescription)
  if (source?.longDescription) return source.longDescription

  const en = rows.find((r) => r.locale === "en" && r.longDescription)
  if (en?.longDescription) return en.longDescription

  return null
}

/**
 * Bulk: localize a list of projects' descriptions in-place for a given locale.
 *
 * One query covers all `(projectId, locale|'en'|source)` rows. Same fallback
 * order as `getLocalizedProjectDescription`: exact locale → source → en →
 * the original `description` already on the project (kept untouched).
 */
/**
 * Resolve the tagline to display for a single (projectId, locale) combo.
 * Same fallback order as description: exact locale → source → en → null.
 */
export async function getLocalizedProjectTagline(
  projectId: string,
  locale: string,
): Promise<string | null> {
  const rows = await db
    .select({
      locale: projectTranslation.locale,
      tagline: projectTranslation.tagline,
      isSource: projectTranslation.isSource,
    })
    .from(projectTranslation)
    .where(eq(projectTranslation.projectId, projectId))

  const exact = rows.find((r) => r.locale === locale && r.tagline)?.tagline
  if (exact) return exact
  const source = rows.find((r) => r.isSource && r.tagline)?.tagline
  if (source) return source
  const en = rows.find((r) => r.locale === "en" && r.tagline)?.tagline
  return en ?? null
}

export async function localizeProjectDescriptions<
  T extends { id: string; description: string | null | undefined; tagline?: string | null },
>(projects: T[], locale: string): Promise<T[]> {
  if (projects.length === 0) return projects

  const ids = projects.map((p) => p.id)
  const localeFilters =
    locale === "en"
      ? [eq(projectTranslation.locale, "en"), eq(projectTranslation.isSource, true)]
      : [
          eq(projectTranslation.locale, locale),
          eq(projectTranslation.locale, "en"),
          eq(projectTranslation.isSource, true),
        ]

  const rows = await db
    .select({
      projectId: projectTranslation.projectId,
      locale: projectTranslation.locale,
      description: projectTranslation.description,
      tagline: projectTranslation.tagline,
      isSource: projectTranslation.isSource,
    })
    .from(projectTranslation)
    .where(and(inArray(projectTranslation.projectId, ids), or(...localeFilters)))

  interface Slot {
    exact?: string
    source?: string
    en?: string
    exactTagline?: string | null
    sourceTagline?: string | null
    enTagline?: string | null
  }
  const byProject = new Map<string, Slot>()
  for (const r of rows) {
    const slot: Slot = byProject.get(r.projectId) ?? {}
    if (r.locale === locale) {
      slot.exact = r.description
      slot.exactTagline = r.tagline
    }
    if (r.isSource) {
      slot.source = r.description
      slot.sourceTagline = r.tagline
    }
    if (r.locale === "en") {
      slot.en = r.description
      slot.enTagline = r.tagline
    }
    byProject.set(r.projectId, slot)
  }

  return projects.map((p) => {
    const slot = byProject.get(p.id)
    if (!slot) return p
    const localizedDescription = slot.exact ?? slot.source ?? slot.en
    // Fallback chain mirrors description: exact locale → source → en.
    // null/empty in any tier is skipped, treating it as "no value here".
    const localizedTagline =
      (slot.exactTagline && slot.exactTagline.trim()) ||
      (slot.sourceTagline && slot.sourceTagline.trim()) ||
      (slot.enTagline && slot.enTagline.trim()) ||
      null
    const next = localizedDescription ? { ...p, description: localizedDescription } : { ...p }
    if (localizedTagline) (next as T & { tagline: string | null }).tagline = localizedTagline
    return next
  })
}

/**
 * Batched variant for callers that need to localize several
 * project lists in one shot (the home page calls this for today /
 * yesterday / month). The single-list version was being called
 * three times per home render — three separate DB queries that
 * could trivially be one.
 *
 * Returns each input group localized, preserving order and length.
 * Duplicate ids across groups (rare but possible) share one
 * translation lookup.
 */
export async function localizeProjectDescriptionGroups<
  T extends { id: string; description: string | null | undefined; tagline?: string | null },
>(groups: T[][], locale: string): Promise<T[][]> {
  const ids = Array.from(new Set(groups.flatMap((g) => g.map((p) => p.id))))
  if (ids.length === 0) return groups

  const localeFilters =
    locale === "en"
      ? [eq(projectTranslation.locale, "en"), eq(projectTranslation.isSource, true)]
      : [
          eq(projectTranslation.locale, locale),
          eq(projectTranslation.locale, "en"),
          eq(projectTranslation.isSource, true),
        ]

  const rows = await db
    .select({
      projectId: projectTranslation.projectId,
      locale: projectTranslation.locale,
      description: projectTranslation.description,
      tagline: projectTranslation.tagline,
      isSource: projectTranslation.isSource,
    })
    .from(projectTranslation)
    .where(and(inArray(projectTranslation.projectId, ids), or(...localeFilters)))

  interface Slot {
    exact?: string
    source?: string
    en?: string
    exactTagline?: string | null
    sourceTagline?: string | null
    enTagline?: string | null
  }
  const byProject = new Map<string, Slot>()
  for (const r of rows) {
    const slot: Slot = byProject.get(r.projectId) ?? {}
    if (r.locale === locale) {
      slot.exact = r.description
      slot.exactTagline = r.tagline
    }
    if (r.isSource) {
      slot.source = r.description
      slot.sourceTagline = r.tagline
    }
    if (r.locale === "en") {
      slot.en = r.description
      slot.enTagline = r.tagline
    }
    byProject.set(r.projectId, slot)
  }

  function applySlot(p: T): T {
    const slot = byProject.get(p.id)
    if (!slot) return p
    const localizedDescription = slot.exact ?? slot.source ?? slot.en
    const localizedTagline =
      (slot.exactTagline && slot.exactTagline.trim()) ||
      (slot.sourceTagline && slot.sourceTagline.trim()) ||
      (slot.enTagline && slot.enTagline.trim()) ||
      null
    const next = localizedDescription ? { ...p, description: localizedDescription } : { ...p }
    if (localizedTagline) (next as T & { tagline: string | null }).tagline = localizedTagline
    return next
  }

  return groups.map((g) => g.map(applySlot))
}
