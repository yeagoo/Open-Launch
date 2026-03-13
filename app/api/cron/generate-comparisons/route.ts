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
import { and, count, desc, eq, or } from "drizzle-orm"

import { generateComparisonContent } from "@/lib/ai-content"
import { getCachedOrCrawl } from "@/lib/crawl4ai"

export const dynamic = "force-dynamic"
export const maxDuration = 90

const API_KEY = process.env.CRON_API_KEY
const MAX_NEW_COMPARISONS_PER_RUN = 3
const CRAWL_TIMEOUT = 15000 // 15s per crawl in cron context

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization")
    const providedKey = authHeader?.replace("Bearer ", "")

    if (!API_KEY || providedKey !== API_KEY) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get all categories
    const categories = await db.select().from(categoryTable)

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

      // Generate pairs from top projects
      for (let i = 0; i < topProjects.length && generated < MAX_NEW_COMPARISONS_PER_RUN; i++) {
        for (
          let j = i + 1;
          j < topProjects.length && generated < MAX_NEW_COMPARISONS_PER_RUN;
          j++
        ) {
          const projA = topProjects[i]
          const projB = topProjects[j]

          // Canonical slug ordering
          const sorted = [projA.slug, projB.slug].sort()
          const slug = `${sorted[0]}-vs-${sorted[1]}`

          // Check if comparison already exists
          const existing = await db
            .select({ id: comparisonPage.id })
            .from(comparisonPage)
            .where(eq(comparisonPage.slug, slug))
            .limit(1)

          if (existing.length > 0) {
            skipped++
            continue
          }

          try {
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

            await db.insert(comparisonPage).values({
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

            generated++
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
