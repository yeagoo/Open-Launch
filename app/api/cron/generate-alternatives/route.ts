import { revalidatePath } from "next/cache"
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
import { getCachedOrCrawl } from "@/lib/crawl4ai"

export const dynamic = "force-dynamic"
export const maxDuration = 90

const API_KEY = process.env.CRON_API_KEY
const MAX_PROJECTS_PER_RUN = 1
const MAX_PRESCREEN_CANDIDATES = 25 // Phase 1: description-only, cheap
const MAX_DEEP_ANALYZE = 5 // Phase 2: crawl + AI, expensive
const MIN_ALTERNATIVES = 2
const MIN_CONFIDENCE_SCORE = 50
const CRAWL_TIMEOUT = 15000

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization")
    const providedKey = authHeader?.replace("Bearer ", "")

    if (!API_KEY || providedKey !== API_KEY) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

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
          sql`${projectTable.id} NOT IN (SELECT subject_project_id FROM alternative_page)`,
          sql`${sameCategoryCountSql} >= ${MIN_ALTERNATIVES}`,
        ),
      )
      .orderBy(sql`${sameCategoryCountSql} DESC`)
      .limit(MAX_PROJECTS_PER_RUN)

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
          skipped++
          continue
        }

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

            if (analysis.isAlternative && analysis.confidenceScore >= MIN_CONFIDENCE_SCORE) {
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
        console.error(`Error generating alternatives for ${subjectProject.name}:`, error)
        errors++
      }
    }

    if (generated > 0) {
      revalidatePath("/alternatives")
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
