"use server"

import { db } from "@/drizzle/db"
import { comparisonPage, project as projectTable } from "@/drizzle/db/schema"
import { count, desc, eq, sql } from "drizzle-orm"

// ─── Types ───────────────────────────────────────────────────────────────────

export type ComparisonWithProjects = {
  id: string
  slug: string
  title: string
  metaTitle: string | null
  metaDescription: string | null
  generatedAt: Date
  projectA: {
    id: string
    name: string
    slug: string
    logoUrl: string
    description: string
  }
  projectB: {
    id: string
    name: string
    slug: string
    logoUrl: string
    description: string
  }
}

export type ComparisonFull = ComparisonWithProjects & {
  content: string
  structuredData: unknown
  categoryId: string | null
}

// ─── Public actions ──────────────────────────────────────────────────────────

export async function getAllComparisons(page = 1, limit = 12) {
  page = Math.max(1, Math.floor(page) || 1)
  limit = Math.min(100, Math.max(1, Math.floor(limit) || 12))
  const offset = (page - 1) * limit

  const comparisons = await db
    .select({
      id: comparisonPage.id,
      slug: comparisonPage.slug,
      title: comparisonPage.title,
      metaTitle: comparisonPage.metaTitle,
      metaDescription: comparisonPage.metaDescription,
      generatedAt: comparisonPage.generatedAt,
      projectAId: comparisonPage.projectAId,
      projectBId: comparisonPage.projectBId,
    })
    .from(comparisonPage)
    .orderBy(desc(comparisonPage.generatedAt))
    .limit(limit)
    .offset(offset)

  // Batch fetch all referenced project IDs
  const allProjectIds = [...new Set(comparisons.flatMap((c) => [c.projectAId, c.projectBId]))]

  const projectsMap = new Map<
    string,
    { id: string; name: string; slug: string; logoUrl: string; description: string }
  >()

  if (allProjectIds.length > 0) {
    const projects = await db
      .select({
        id: projectTable.id,
        name: projectTable.name,
        slug: projectTable.slug,
        logoUrl: projectTable.logoUrl,
        description: projectTable.description,
      })
      .from(projectTable)
      .where(sql`${projectTable.id} IN ${allProjectIds}`)

    for (const p of projects) {
      projectsMap.set(p.id, p)
    }
  }

  const results: ComparisonWithProjects[] = []
  for (const comp of comparisons) {
    const projA = projectsMap.get(comp.projectAId)
    const projB = projectsMap.get(comp.projectBId)

    if (projA && projB) {
      results.push({
        ...comp,
        projectA: projA,
        projectB: projB,
      })
    }
  }

  const totalResult = await db.select({ count: count() }).from(comparisonPage)

  return {
    comparisons: results,
    totalCount: totalResult[0]?.count || 0,
  }
}

export async function getComparisonBySlug(slug: string): Promise<ComparisonFull | null> {
  const [comp] = await db
    .select()
    .from(comparisonPage)
    .where(eq(comparisonPage.slug, slug))
    .limit(1)

  if (!comp) return null

  const [projA] = await db
    .select({
      id: projectTable.id,
      name: projectTable.name,
      slug: projectTable.slug,
      logoUrl: projectTable.logoUrl,
      description: projectTable.description,
    })
    .from(projectTable)
    .where(eq(projectTable.id, comp.projectAId))
    .limit(1)

  const [projB] = await db
    .select({
      id: projectTable.id,
      name: projectTable.name,
      slug: projectTable.slug,
      logoUrl: projectTable.logoUrl,
      description: projectTable.description,
    })
    .from(projectTable)
    .where(eq(projectTable.id, comp.projectBId))
    .limit(1)

  if (!projA || !projB) return null

  return {
    id: comp.id,
    slug: comp.slug,
    title: comp.title,
    metaTitle: comp.metaTitle,
    metaDescription: comp.metaDescription,
    content: comp.content,
    structuredData: comp.structuredData,
    categoryId: comp.categoryId,
    generatedAt: comp.generatedAt,
    projectA: projA,
    projectB: projB,
  }
}

export async function getComparisonExists(
  projectASlug: string,
  projectBSlug: string,
): Promise<boolean> {
  // buildComparisonSlug already sorts alphabetically, so both orderings produce the same slug
  const slug = buildComparisonSlug(projectASlug, projectBSlug)
  const result = await db
    .select({ id: comparisonPage.id })
    .from(comparisonPage)
    .where(eq(comparisonPage.slug, slug))
    .limit(1)

  return result.length > 0
}

// Canonical slug ordering
function buildComparisonSlug(slugA: string, slugB: string): string {
  const sorted = [slugA, slugB].sort()
  return `${sorted[0]}-vs-${sorted[1]}`
}
