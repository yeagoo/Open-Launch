import { revalidatePath, revalidateTag } from "next/cache"
import { NextRequest, NextResponse } from "next/server"

import { db } from "@/drizzle/db"
import {
  category as categoryTable,
  comparisonAttempt,
  comparisonPage,
  launchStatus,
  project as projectTable,
  projectToCategory,
  upvote,
} from "@/drizzle/db/schema"
import { and, count, desc, eq, gte, or, sql } from "drizzle-orm"

import { generateComparisonContent } from "@/lib/ai-content"
import { PROJECT_SIDEBAR_LINKS_TAG } from "@/lib/cache-tags"
import { getCachedOrCrawl } from "@/lib/crawl4ai"
import { verifyCronAuth } from "@/lib/cron-auth"
import { getEnglishDescriptions } from "@/lib/get-project-translation"

export const dynamic = "force-dynamic"
export const maxDuration = 90

const MAX_NEW_COMPARISONS_PER_RUN = 1
const CRAWL_TIMEOUT = 15000 // 15s per crawl in cron context
// How long to skip a comparison pair after a failed attempt. Without
// this the cron retries the same broken pair every 30 min, burning
// Tinyfish slots on URLs we already know are dead.
const FAILURE_COOLDOWN_HOURS = 24

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
            eq(projectTable.isLowQuality, false),
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

            // Skip if this pair failed recently — no point burning a
            // Tinyfish slot every 30 min on URLs we already know are
            // dead.
            const cooldownCutoff = new Date(Date.now() - FAILURE_COOLDOWN_HOURS * 60 * 60 * 1000)
            const [recentFailure] = await db
              .select({ slug: comparisonAttempt.slug })
              .from(comparisonAttempt)
              .where(
                and(
                  eq(comparisonAttempt.slug, slug),
                  gte(comparisonAttempt.lastFailedAt, cooldownCutoff),
                ),
              )
              .limit(1)
            if (recentFailure) {
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
            // Record the failure so we skip this pair for the next 24h.
            // Postgres upsert: bump attempt_count + lastFailedAt on
            // re-failure (e.g. once every 24h after cooldown expires).
            const errMsg = (error instanceof Error ? error.message : String(error)).slice(0, 500)
            try {
              await db
                .insert(comparisonAttempt)
                .values({
                  slug,
                  lastFailedAt: new Date(),
                  attemptCount: 1,
                  error: errMsg,
                })
                .onConflictDoUpdate({
                  target: comparisonAttempt.slug,
                  set: {
                    lastFailedAt: new Date(),
                    attemptCount: sql`${comparisonAttempt.attemptCount} + 1`,
                    error: errMsg,
                  },
                })
            } catch (recordErr) {
              console.error(`Failed to record comparison_attempt for ${slug}:`, recordErr)
            }
          }
        }
      }
    }

    if (generated > 0) {
      revalidatePath("/compare")
      // Detail pages cache their sidebar comparison list per project;
      // bust the tag so freshly-written comparisons surface without
      // waiting for the 6h revalidate window.
      revalidateTag(PROJECT_SIDEBAR_LINKS_TAG)
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
