import { revalidatePath, revalidateTag } from "next/cache"
import { NextRequest, NextResponse } from "next/server"

import { db } from "@/drizzle/db"
import {
  alternativePage,
  alternativePageToProject,
  launchStatus,
  project as projectTable,
  projectToCategory,
} from "@/drizzle/db/schema"
import { and, eq, or, sql } from "drizzle-orm"

import {
  analyzeAlternative,
  generateAlternativesPageContent,
  prescreenAlternatives,
} from "@/lib/ai-content"
import { PROJECT_SIDEBAR_LINKS_TAG } from "@/lib/cache-tags"
import { getCachedOrCrawl } from "@/lib/crawl4ai"
import { verifyCronAuth } from "@/lib/cron-auth"
import { getEnglishDescriptions } from "@/lib/get-project-translation"

export const dynamic = "force-dynamic"
export const maxDuration = 90

const MAX_PROJECTS_PER_RUN = 1
const MAX_PRESCREEN_CANDIDATES = 25 // Phase 1: description-only, cheap
const MAX_DEEP_ANALYZE = 5 // Phase 2: crawl + AI, expensive
const MIN_ALTERNATIVES = 2
const MIN_CONFIDENCE_SCORE = 30 // Phase 2 enrichment threshold — Phase 1 prescreening is the quality gate
const CRAWL_TIMEOUT = 15000
// Don't re-evaluate subjects that already failed (no pool / no en translations
// / no AI matches) until this many days have passed. Lets the catalog grow
// without burning DeepSeek calls on the same dead-ends every 5 minutes.
const REATTEMPT_DAYS = 30

export async function GET(request: NextRequest) {
  try {
    const authError = verifyCronAuth(request)
    if (authError) return authError

    // Select projects that have >= MIN_ALTERNATIVES same-category peers,
    // prioritising those with the most peers (most likely to succeed).
    const sameCategoryCountSql = sql<number>`(
      SELECT COUNT(DISTINCT pc2.project_id)
      FROM project_to_category pc1
      JOIN project_to_category pc2
        ON pc2.category_id = pc1.category_id AND pc2.project_id != ${projectTable.id}
      JOIN project p2
        ON p2.id = pc2.project_id AND p2.launch_status IN ('ongoing', 'launched')
      WHERE pc1.project_id = ${projectTable.id}
    )`

    const reattemptCutoff = new Date(Date.now() - REATTEMPT_DAYS * 24 * 60 * 60 * 1000)

    const candidateProjects = await db
      .select({
        id: projectTable.id,
        name: projectTable.name,
        slug: projectTable.slug,
        description: projectTable.description,
        websiteUrl: projectTable.websiteUrl,
        techStack: projectTable.techStack,
      })
      .from(projectTable)
      .where(
        and(
          or(
            eq(projectTable.launchStatus, launchStatus.ONGOING),
            eq(projectTable.launchStatus, launchStatus.LAUNCHED),
          ),
          eq(projectTable.isLowQuality, false),
          sql`${projectTable.id} NOT IN (SELECT subject_project_id FROM alternative_page)`,
          sql`${sameCategoryCountSql} >= ${MIN_ALTERNATIVES}`,
          sql`(${projectTable.alternativesAttemptedAt} IS NULL OR ${projectTable.alternativesAttemptedAt} < ${reattemptCutoff})`,
        ),
      )
      .orderBy(sql`${sameCategoryCountSql} DESC`)
      .limit(MAX_PROJECTS_PER_RUN)

    // Stamp `alternatives_attempted_at` so projects that fail any criterion
    // (insufficient pool, no en translations yet, AI rejected all candidates)
    // don't loop back into the candidate set on the very next tick.
    const markAttempted = async (projectId: string) => {
      await db
        .update(projectTable)
        .set({ alternativesAttemptedAt: new Date() })
        .where(eq(projectTable.id, projectId))
    }

    let generated = 0
    let skipped = 0
    let errors = 0

    for (const subjectProject of candidateProjects) {
      try {
        // Get this project's categories
        const subjectCategories = await db
          .select({ categoryId: projectToCategory.categoryId })
          .from(projectToCategory)
          .where(eq(projectToCategory.projectId, subjectProject.id))

        if (subjectCategories.length === 0) {
          console.log(`⏭️  Skipping "${subjectProject.name}": no categories`)
          await markAttempted(subjectProject.id)
          skipped++
          continue
        }

        const categoryIds = subjectCategories.map((c) => c.categoryId)

        // ── Phase 1: Fetch up to 25 candidates, prescreen with AI (no crawl) ──
        const pool = await db
          .select({
            id: projectTable.id,
            name: projectTable.name,
            slug: projectTable.slug,
            description: projectTable.description,
            websiteUrl: projectTable.websiteUrl,
            techStack: projectTable.techStack,
          })
          .from(projectTable)
          .innerJoin(projectToCategory, eq(projectTable.id, projectToCategory.projectId))
          .where(
            and(
              sql`${projectToCategory.categoryId} IN ${categoryIds}`,
              sql`${projectTable.id} != ${subjectProject.id}`,
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
            projectTable.techStack,
          )
          .limit(MAX_PRESCREEN_CANDIDATES)

        console.log(`🔍 "${subjectProject.name}": ${pool.length} candidates in pool`)

        if (pool.length < MIN_ALTERNATIVES) {
          console.log(`⏭️  Skipping "${subjectProject.name}": pool too small (${pool.length})`)
          await markAttempted(subjectProject.id)
          skipped++
          continue
        }

        // Alternatives pages are English-only — require en translations for
        // both subject and any pool member used downstream. Skip the subject
        // (will retry next run) if its English translation isn't ready.
        const enDescriptions = await getEnglishDescriptions([
          subjectProject.id,
          ...pool.map((p) => p.id),
        ])
        if (!(subjectProject.id in enDescriptions)) {
          console.log(`⏭️  Skipping "${subjectProject.name}": no en translation yet`)
          await markAttempted(subjectProject.id)
          skipped++
          continue
        }
        subjectProject.description = enDescriptions[subjectProject.id]!

        // Drop pool members that don't have en translations yet
        const eligiblePool = pool.filter((p) => p.id in enDescriptions)
        for (const p of eligiblePool) {
          p.description = enDescriptions[p.id]!
        }
        if (eligiblePool.length < MIN_ALTERNATIVES) {
          console.log(
            `⏭️  Skipping "${subjectProject.name}": only ${eligiblePool.length} pool members have en translations`,
          )
          await markAttempted(subjectProject.id)
          skipped++
          continue
        }
        // Replace pool with the eligible subset for the rest of the iteration
        pool.length = 0
        pool.push(...eligiblePool)

        // Ask AI which candidates are likely alternatives (cheap: names + descriptions only)
        const prescreenedIds = await prescreenAlternatives(
          {
            name: subjectProject.name,
            description: subjectProject.description,
            techStack: subjectProject.techStack ?? [],
          },
          pool.map((p) => ({
            id: p.id,
            name: p.name,
            description: p.description,
            techStack: p.techStack ?? [],
          })),
        )

        console.log(
          `🤖 Pre-screen: ${prescreenedIds.length} likely alternatives → ${prescreenedIds.map((id) => pool.find((p) => p.id === id)?.name).join(", ")}`,
        )

        if (prescreenedIds.length < MIN_ALTERNATIVES) {
          console.log(
            `⏭️  Skipping "${subjectProject.name}": pre-screen found only ${prescreenedIds.length} (need ${MIN_ALTERNATIVES})`,
          )
          await markAttempted(subjectProject.id)
          skipped++
          continue
        }

        // ── Phase 2: Crawl + deep-analyze prescreened candidates only ──
        const prescreenedCandidates = pool
          .filter((p) => prescreenedIds.includes(p.id))
          .slice(0, MAX_DEEP_ANALYZE)

        const subjectCrawl = await getCachedOrCrawl(
          subjectProject.id,
          subjectProject.websiteUrl,
          7,
          { timeout: CRAWL_TIMEOUT },
        )

        const confirmedAlternatives: Array<{
          project: (typeof prescreenedCandidates)[0]
          score: number
          pros: string[]
          cons: string[]
          useCases: string
        }> = []

        for (const candidate of prescreenedCandidates) {
          try {
            const candidateCrawl = await getCachedOrCrawl(candidate.id, candidate.websiteUrl, 7, {
              timeout: CRAWL_TIMEOUT,
            })

            const analysis = await analyzeAlternative(
              {
                name: subjectProject.name,
                description: subjectProject.description,
                crawledMarkdown: subjectCrawl.markdown,
              },
              {
                name: candidate.name,
                description: candidate.description,
                crawledMarkdown: candidateCrawl.markdown,
              },
            )

            console.log(
              `  📊 ${candidate.name}: isAlt=${analysis.isAlternative}, score=${analysis.confidenceScore}`,
            )

            // Phase 1 prescreening is the quality gate; Phase 2 provides enrichment (pros/cons/useCases).
            // Accept all prescreened candidates that score above the minimum threshold.
            if (analysis.confidenceScore >= MIN_CONFIDENCE_SCORE) {
              confirmedAlternatives.push({
                project: candidate,
                score: analysis.confidenceScore,
                pros: analysis.pros,
                cons: analysis.cons,
                useCases: analysis.useCases,
              })
            }
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error)
            console.error(`Error analyzing ${candidate.name} as alternative: ${msg}`)
          }
        }

        if (confirmedAlternatives.length < MIN_ALTERNATIVES) {
          console.log(
            `⏭️  Skipping "${subjectProject.name}": only ${confirmedAlternatives.length} confirmed (need ${MIN_ALTERNATIVES})`,
          )
          await markAttempted(subjectProject.id)
          skipped++
          continue
        }

        confirmedAlternatives.sort((a, b) => b.score - a.score)

        // Generate page content
        const pageContent = await generateAlternativesPageContent(
          { name: subjectProject.name, description: subjectProject.description },
          confirmedAlternatives.map((a) => ({
            name: a.project.name,
            score: a.score,
            pros: a.pros,
            cons: a.cons,
            useCases: a.useCases,
          })),
        )

        const pageSlug = `${subjectProject.slug}-alternatives`

        const pageId = crypto.randomUUID()
        await db.transaction(async (tx) => {
          const rows = await tx
            .insert(alternativePage)
            .values({
              id: pageId,
              slug: pageSlug,
              subjectProjectId: subjectProject.id,
              title: pageContent.title,
              metaTitle: pageContent.metaTitle,
              metaDescription: pageContent.metaDescription,
              content: pageContent.rawMarkdown,
              generatedAt: new Date(),
              createdAt: new Date(),
              updatedAt: new Date(),
            })
            .onConflictDoNothing({ target: alternativePage.slug })
            .returning({ id: alternativePage.id })

          if (rows.length === 0) return // already exists, skip relations

          for (let i = 0; i < confirmedAlternatives.length; i++) {
            const alt = confirmedAlternatives[i]
            await tx.insert(alternativePageToProject).values({
              alternativePageId: pageId,
              projectId: alt.project.id,
              aiScore: alt.score,
              prosConsJson: { pros: alt.pros, cons: alt.cons },
              useCases: alt.useCases,
              sortOrder: i,
            })
          }
        })

        console.log(`✅ Generated alternatives page for "${subjectProject.name}"`)
        generated++
      } catch (error) {
        // Stamp on catch too. Tradeoff: a transient outage (Crawl4AI / DeepSeek
        // 5xx, DB blip) suppresses the subject for ~30 days when it would have
        // succeeded on retry. The alternative — never stamping — lets a single
        // permanently-broken project (dead websiteUrl, malformed URL) sit at
        // the head of the priority queue and starve every other candidate
        // forever, since the cron only processes 1 project per tick. The
        // starvation case is recurring; the false-positive case is one-shot,
        // so we stamp.
        console.error(`Error generating alternatives for ${subjectProject.name}:`, error)
        errors++
        await markAttempted(subjectProject.id).catch(() => {})
      }
    }

    if (generated > 0) {
      revalidatePath("/alternatives")
      // Detail pages cache their sidebar alternatives list per
      // project; bust the tag so freshly-written pages surface
      // without waiting for the 6h revalidate window.
      revalidateTag(PROJECT_SIDEBAR_LINKS_TAG)
    }

    return NextResponse.json({
      message: "Alternatives generation complete",
      generated,
      skipped,
      errors,
    })
  } catch (error) {
    console.error("Error in alternatives generation cron:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
