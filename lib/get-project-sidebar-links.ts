import { db } from "@/drizzle/db"
import {
  alternativePage,
  alternativePageToProject,
  comparisonPage,
  project,
} from "@/drizzle/db/schema"
import { desc, eq, or } from "drizzle-orm"

export interface SidebarComparisonLink {
  slug: string
  title: string
}

export interface SidebarAlternativeLink {
  slug: string
  title: string
  isSubject: boolean // true when this project is THE subject of the alternatives page
}

export interface ProjectSidebarLinks {
  comparisons: SidebarComparisonLink[]
  alternatives: SidebarAlternativeLink[]
}

/**
 * Pages that already exist on aat.ee and feature this project, so the
 * project detail page can surface them as related-content sidebar
 * widgets. AI cron jobs (`generate-comparisons`, `generate-alternatives`)
 * produce both kinds of pages but currently nothing on the project page
 * links to them — this helper closes that loop.
 *
 * - Comparisons: any `comparison_page` where the project is on either
 *   side. Limited to the most recent 5.
 * - Alternatives: split into two cases —
 *     1. The project IS the subject of an alternatives page (highest
 *        relevance — "Best alternatives to {this}").
 *     2. The project appears AS one of the alternatives on someone
 *        else's page (still useful — "Tools like {other}, including
 *        {this}").
 *   Returned in that priority order, capped at 5 total.
 */
export async function getProjectSidebarLinks(projectId: string): Promise<ProjectSidebarLinks> {
  const [comparisons, asSubject, asListed] = await Promise.all([
    db
      .select({ slug: comparisonPage.slug, title: comparisonPage.title })
      .from(comparisonPage)
      .where(or(eq(comparisonPage.projectAId, projectId), eq(comparisonPage.projectBId, projectId)))
      .orderBy(desc(comparisonPage.generatedAt))
      .limit(5),

    db
      .select({ slug: alternativePage.slug, title: alternativePage.title })
      .from(alternativePage)
      .where(eq(alternativePage.subjectProjectId, projectId))
      .orderBy(desc(alternativePage.generatedAt))
      .limit(5),

    db
      .select({ slug: alternativePage.slug, title: alternativePage.title })
      .from(alternativePageToProject)
      .innerJoin(
        alternativePage,
        eq(alternativePageToProject.alternativePageId, alternativePage.id),
      )
      // Avoid double-counting the page where this project is itself the
      // subject — that case is in `asSubject` above.
      .innerJoin(project, eq(alternativePage.subjectProjectId, project.id))
      .where(eq(alternativePageToProject.projectId, projectId))
      .orderBy(desc(alternativePage.generatedAt))
      .limit(5),
  ])

  // Merge the two alternative buckets, subject-first, deduped by slug.
  const seen = new Set<string>()
  const alternatives: SidebarAlternativeLink[] = []
  for (const row of asSubject) {
    if (seen.has(row.slug)) continue
    seen.add(row.slug)
    alternatives.push({ slug: row.slug, title: row.title, isSubject: true })
  }
  for (const row of asListed) {
    if (seen.has(row.slug)) continue
    seen.add(row.slug)
    alternatives.push({ slug: row.slug, title: row.title, isSubject: false })
    if (alternatives.length >= 5) break
  }

  return {
    comparisons: comparisons.map((c) => ({ slug: c.slug, title: c.title })),
    alternatives,
  }
}
