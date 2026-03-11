"use server"

import { db } from "@/drizzle/db"
import {
  alternativePage,
  alternativePageToProject,
  project as projectTable,
} from "@/drizzle/db/schema"
import { asc, count, desc, eq, sql } from "drizzle-orm"

// ─── Types ───────────────────────────────────────────────────────────────────

export type AlternativePageSummary = {
  id: string
  slug: string
  title: string
  metaTitle: string | null
  generatedAt: Date
  subjectProject: {
    id: string
    name: string
    slug: string
    logoUrl: string
    description: string
  }
  alternativeCount: number
}

export type AlternativePageFull = AlternativePageSummary & {
  content: string
  metaDescription: string | null
  alternatives: Array<{
    id: string
    name: string
    slug: string
    logoUrl: string
    description: string
    websiteUrl: string
    aiScore: number | null
    prosConsJson: { pros: string[]; cons: string[] } | null
    useCases: string | null
    sortOrder: number
  }>
}

// ─── Public actions ──────────────────────────────────────────────────────────

export async function getAllAlternativePages(page = 1, limit = 12) {
  page = Math.max(1, Math.floor(page) || 1)
  limit = Math.min(100, Math.max(1, Math.floor(limit) || 12))
  const offset = (page - 1) * limit

  const pages = await db
    .select({
      id: alternativePage.id,
      slug: alternativePage.slug,
      title: alternativePage.title,
      metaTitle: alternativePage.metaTitle,
      generatedAt: alternativePage.generatedAt,
      subjectProjectId: alternativePage.subjectProjectId,
    })
    .from(alternativePage)
    .orderBy(desc(alternativePage.generatedAt))
    .limit(limit)
    .offset(offset)

  // Batch fetch all subject projects
  const subjectProjectIds = [...new Set(pages.map((p) => p.subjectProjectId))]
  const projectsMap = new Map<
    string,
    { id: string; name: string; slug: string; logoUrl: string; description: string }
  >()

  if (subjectProjectIds.length > 0) {
    const projects = await db
      .select({
        id: projectTable.id,
        name: projectTable.name,
        slug: projectTable.slug,
        logoUrl: projectTable.logoUrl,
        description: projectTable.description,
      })
      .from(projectTable)
      .where(sql`${projectTable.id} IN ${subjectProjectIds}`)

    for (const p of projects) {
      projectsMap.set(p.id, p)
    }
  }

  // Batch fetch alternative counts
  const pageIds = pages.map((p) => p.id)
  const altCountsMap = new Map<string, number>()

  if (pageIds.length > 0) {
    const altCounts = await db
      .select({
        alternativePageId: alternativePageToProject.alternativePageId,
        count: count(),
      })
      .from(alternativePageToProject)
      .where(sql`${alternativePageToProject.alternativePageId} IN ${pageIds}`)
      .groupBy(alternativePageToProject.alternativePageId)

    for (const ac of altCounts) {
      altCountsMap.set(ac.alternativePageId, ac.count)
    }
  }

  const results: AlternativePageSummary[] = []
  for (const pg of pages) {
    const subjectProject = projectsMap.get(pg.subjectProjectId)
    if (!subjectProject) continue

    results.push({
      ...pg,
      subjectProject,
      alternativeCount: altCountsMap.get(pg.id) || 0,
    })
  }

  const totalResult = await db.select({ count: count() }).from(alternativePage)

  return {
    pages: results,
    totalCount: totalResult[0]?.count || 0,
  }
}

export async function getAlternativePageBySlug(slug: string): Promise<AlternativePageFull | null> {
  const [pg] = await db
    .select()
    .from(alternativePage)
    .where(eq(alternativePage.slug, slug))
    .limit(1)

  if (!pg) return null

  const [subjectProject] = await db
    .select({
      id: projectTable.id,
      name: projectTable.name,
      slug: projectTable.slug,
      logoUrl: projectTable.logoUrl,
      description: projectTable.description,
    })
    .from(projectTable)
    .where(eq(projectTable.id, pg.subjectProjectId))
    .limit(1)

  if (!subjectProject) return null

  // Get alternatives with project data
  const altRows = await db
    .select({
      projectId: alternativePageToProject.projectId,
      aiScore: alternativePageToProject.aiScore,
      prosConsJson: alternativePageToProject.prosConsJson,
      useCases: alternativePageToProject.useCases,
      sortOrder: alternativePageToProject.sortOrder,
    })
    .from(alternativePageToProject)
    .where(eq(alternativePageToProject.alternativePageId, pg.id))
    .orderBy(asc(alternativePageToProject.sortOrder))

  // Batch fetch all alternative projects
  const altProjectIds = altRows.map((a) => a.projectId)
  const altProjectsMap = new Map<
    string,
    {
      id: string
      name: string
      slug: string
      logoUrl: string
      description: string
      websiteUrl: string
    }
  >()

  if (altProjectIds.length > 0) {
    const altProjects = await db
      .select({
        id: projectTable.id,
        name: projectTable.name,
        slug: projectTable.slug,
        logoUrl: projectTable.logoUrl,
        description: projectTable.description,
        websiteUrl: projectTable.websiteUrl,
      })
      .from(projectTable)
      .where(sql`${projectTable.id} IN ${altProjectIds}`)

    for (const p of altProjects) {
      altProjectsMap.set(p.id, p)
    }
  }

  const alternatives = altRows
    .map((alt) => {
      const proj = altProjectsMap.get(alt.projectId)
      if (!proj) return null
      return {
        ...proj,
        aiScore: alt.aiScore,
        prosConsJson: alt.prosConsJson as {
          pros: string[]
          cons: string[]
        } | null,
        useCases: alt.useCases,
        sortOrder: alt.sortOrder,
      }
    })
    .filter((a): a is NonNullable<typeof a> => a !== null)

  return {
    id: pg.id,
    slug: pg.slug,
    title: pg.title,
    metaTitle: pg.metaTitle,
    metaDescription: pg.metaDescription,
    content: pg.content,
    generatedAt: pg.generatedAt,
    subjectProject,
    alternativeCount: alternatives.length,
    alternatives,
  }
}
