import { revalidatePath } from "next/cache"
import { NextRequest, NextResponse } from "next/server"

import { db } from "@/drizzle/db"
import {
  category as categoryTable,
  comparisonPage,
  launchStatus,
  project as projectTable,
  projectToCategory,
  upvote,
} from "@/drizzle/db/schema"
import { and, count, desc, eq, or, sql } from "drizzle-orm"

import { generateComparisonContent } from "@/lib/ai-content"
import { getCachedOrCrawl } from "@/lib/crawl4ai"
import { verifyCronAuth } from "@/lib/cron-auth"
import { getEnglishDescriptions } from "@/lib/get-project-translation"

export const dynamic = "force-dynamic"
export const maxDuration = 90

const MAX_NEW_COMPARISONS_PER_RUN = 1
const CRAWL_TIMEOUT = 15000 // 15s per crawl in cron context

export async function GET(request: NextRequest) {
  try {
    const authError = verifyCronAuth(request)
    if (authError) return authError

    // Get categories that have at least 2 ongoing/launched projects (skip empty ones)
    const categories = await db
      .select({ id: categoryTable.id, name: categoryTable.name })
      .from(categoryTable)
      .where(
        sql`(
          SELECT COUNT(DISTINCT p.id)
          FROM project p
          JOIN project_to_category ptc ON ptc.project_id = p.id AND ptc.category_id = ${categoryTable.id}
          WHERE p.launch_status IN ('ongoing', 'launched')
        ) >= 2`,
      )

    let generated = 0
    let skipped = 0
    let errors = 0

    for (const cat of categories) {
      if (generated >= MAX_NEW_COMPARISONS_PER_RUN) break

      // Get top projects in this category by upvote count
      const topProjects = await db
        .select({
          id: projectTable.id,
          name: projectTable.name,
          slug: projectTable.slug,
          description: projectTable.description,
          websiteUrl: projectTable.websiteUrl,
          upvoteCount: count(upvote.id),
        })
        .from(projectTable)
        .innerJoin(projectToCategory, eq(projectTable.id, projectToCategory.projectId))
        .leftJoin(upvote, eq(upvote.projectId, projectTable.id))
        .where(
          and(
            eq(projectToCategory.categoryId, cat.id),
            or(
              eq(projectTable.launchStatus, launchStatus.ONGOING),
              eq(projectTable.launchStatus, launchStatus.LAUNCHED),
            ),
          ),
        )
        .groupBy(
          projectTable.id,
          projectTable.name,
          projectTable.slug,
          projectTable.description,
          projectTable.websiteUrl,
        )
        .orderBy(desc(count(upvote.id)))
        .limit(5)

      if (topProjects.length < 2) continue

      // Comparison pages are English-only — only consider projects that
      // already have an English translation. The translate-projects cron
      // backfills these continuously; projects skipped here will be picked
      // up on a future run.
      const enDescriptions = await getEnglishDescriptions(topProjects.map((p) => p.id))
      const eligibleProjects = topProjects.filter((p) => p.id in enDescriptions)
      if (eligibleProjects.length < 2) {
        console.log(
          `⏭️  Category "${cat.name}": only ${eligibleProjects.length} projects have en translations`,
        )
        continue
      }
      for (const p of eligibleProjects) {
        p.description = enDescriptions[p.id]!
      }

      // Generate pairs from eligible (English-translated) projects
      for (let i = 0; i < eligibleProjects.length && generated < MAX_NEW_COMPARISONS_PER_RUN; i++) {
        for (
          let j = i + 1;
          j < eligibleProjects.length && generated < MAX_NEW_COMPARISONS_PER_RUN;
          j++
        ) {
          const projA = eligibleProjects[i]
          const projB = eligibleProjects[j]

          // Canonical slug ordering
          const sorted = [projA.slug, projB.slug].sort()
          const slug = `${sorted[0]}-vs-${sorted[1]}`

          try {
            // Skip if comparison page already exists (avoid wasting crawl + LLM cost)
            const [existing] = await db
              .select({ id: comparisonPage.id })
              .from(comparisonPage)
              .where(eq(comparisonPage.slug, slug))
              .limit(1)
            if (existing) {
              skipped++
              continue
            }

            // Crawl both websites
            const [crawlA, crawlB] = await Promise.all([
              getCachedOrCrawl(projA.id, projA.websiteUrl, 7, { timeout: CRAWL_TIMEOUT }),
              getCachedOrCrawl(projB.id, projB.websiteUrl, 7, { timeout: CRAWL_TIMEOUT }),
            ])

            // Generate comparison content
            const content = await generateComparisonContent(
              {
                name: projA.name,
                description: projA.description,
                crawledMarkdown: crawlA.markdown,
              },
              {
                name: projB.name,
                description: projB.description,
                crawledMarkdown: crawlB.markdown,
              },
            )

            // Determine which project is A and B based on sort order
            const [projectAId, projectBId] =
              projA.slug === sorted[0] ? [projA.id, projB.id] : [projB.id, projA.id]

            const rows = await db
              .insert(comparisonPage)
              .values({
                id: crypto.randomUUID(),
                slug,
                projectAId,
                projectBId,
                categoryId: cat.id,
                title: content.title,
                metaTitle: content.metaTitle,
                metaDescription: content.metaDescription,
                content: content.rawMarkdown,
                structuredData: content.structuredData,
                generatedAt: new Date(),
                createdAt: new Date(),
                updatedAt: new Date(),
              })
              .onConflictDoNothing({ target: comparisonPage.slug })
              .returning({ id: comparisonPage.id })

            if (rows.length > 0) generated++
            else skipped++
          } catch (error) {
            console.error(`Error generating comparison ${projA.name} vs ${projB.name}:`, error)
            errors++
          }
        }
      }
    }

    if (generated > 0) {
      revalidatePath("/compare")
    }

    return NextResponse.json({
      message: "Comparison generation complete",
      generated,
      skipped,
      errors,
    })
  } catch (error) {
    console.error("Error in comparison generation cron:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
