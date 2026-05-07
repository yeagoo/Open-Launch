import { db } from "@/drizzle/db"
import { project, projectRelated, projectTranslation } from "@/drizzle/db/schema"
import { and, asc, eq, inArray, or } from "drizzle-orm"

export interface RelatedProjectCard {
  id: string
  slug: string
  name: string
  description: string
  logoUrl: string
}

/**
 * Fetch related products for a given project, with descriptions localized via
 * the same locale → source → en fallback used elsewhere.
 */
export async function getRelatedProjects(
  projectId: string,
  locale: string,
  limit = 4,
): Promise<RelatedProjectCard[]> {
  const relations = await db
    .select({
      relatedId: projectRelated.relatedProjectId,
      rank: projectRelated.rank,
    })
    .from(projectRelated)
    .where(eq(projectRelated.projectId, projectId))
    .orderBy(asc(projectRelated.rank))
    .limit(limit)

  if (relations.length === 0) return []

  const ids = relations.map((r) => r.relatedId)

  const projects = await db
    .select({
      id: project.id,
      slug: project.slug,
      name: project.name,
      description: project.description,
      logoUrl: project.logoUrl,
    })
    .from(project)
    .where(inArray(project.id, ids))

  const projectsById = new Map(projects.map((p) => [p.id, p]))

  // One bulk query for translations covering locale + en + source.
  const translationFilters =
    locale === "en"
      ? [eq(projectTranslation.locale, "en"), eq(projectTranslation.isSource, true)]
      : [
          eq(projectTranslation.locale, locale),
          eq(projectTranslation.locale, "en"),
          eq(projectTranslation.isSource, true),
        ]
  const translations = await db
    .select({
      projectId: projectTranslation.projectId,
      locale: projectTranslation.locale,
      description: projectTranslation.description,
      isSource: projectTranslation.isSource,
    })
    .from(projectTranslation)
    .where(and(inArray(projectTranslation.projectId, ids), or(...translationFilters)))

  const slotsByProject = new Map<string, { exact?: string; source?: string; en?: string }>()
  for (const t of translations) {
    const slot = slotsByProject.get(t.projectId) ?? {}
    if (t.locale === locale) slot.exact = t.description
    if (t.isSource) slot.source = t.description
    if (t.locale === "en") slot.en = t.description
    slotsByProject.set(t.projectId, slot)
  }

  // Preserve rank order from `relations`.
  const out: RelatedProjectCard[] = []
  for (const rel of relations) {
    const p = projectsById.get(rel.relatedId)
    if (!p) continue
    const slot = slotsByProject.get(p.id)
    const localizedDescription = slot?.exact ?? slot?.source ?? slot?.en ?? p.description
    out.push({
      id: p.id,
      slug: p.slug,
      name: p.name,
      description: localizedDescription,
      logoUrl: p.logoUrl,
    })
  }
  return out
}
