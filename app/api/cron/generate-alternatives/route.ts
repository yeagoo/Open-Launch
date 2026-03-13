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

import { analyzeAlternative, generateAlternativesPageContent } from "@/lib/ai-content"
import { getCachedOrCrawl } from "@/lib/crawl4ai"

export const dynamic = "force-dynamic"
export const maxDuration = 90

const API_KEY = process.env.CRON_API_KEY
const MAX_PROJECTS_PER_RUN = 1
const MAX_CANDIDATES = 5
const MIN_ALTERNATIVES = 3
const MIN_CONFIDENCE_SCORE = 60
const CRAWL_TIMEOUT = 15000 // 15s per crawl in cron context

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization")
    const providedKey = authHeader?.replace("Bearer ", "")

    if (!API_KEY || providedKey !== API_KEY) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Find launched projects without an alternatives page
    const existingPageProjectIds = db
      .select({ subjectProjectId: alternativePage.subjectProjectId })
      .from(alternativePage)

    const candidateProjects = await db
      .select({
        id: projectTable.id,
        name: projectTable.name,
        slug: projectTable.slug,
        description: projectTable.description,
        websiteUrl: projectTable.websiteUrl,
      })
      .from(projectTable)
      .where(
        and(
          or(
            eq(projectTable.launchStatus, launchStatus.ONGOING),
            eq(projectTable.launchStatus, launchStatus.LAUNCHED),
          ),
          sql`${projectTable.id} NOT IN (${existingPageProjectIds})`,
        ),
      )
      .limit(MAX_PROJECTS_PER_RUN)

    let generated = 0
    let skipped = 0
    let errors = 0

    for (const subjectProject of candidateProjects) {
      try {
        // Find same-category projects
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

        // Get other projects in the same categories
        const candidates = await db
          .select({
            id: projectTable.id,
            name: projectTable.name,
            slug: projectTable.slug,
            description: projectTable.description,
            websiteUrl: projectTable.websiteUrl,
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
          )
          .limit(MAX_CANDIDATES)

        if (candidates.length < MIN_ALTERNATIVES) {
          console.log(
            `⏭️  Skipping "${subjectProject.name}": only ${candidates.length} candidates (need ${MIN_ALTERNATIVES})`,
          )
          skipped++
          continue
        }

        // Crawl subject project
        const subjectCrawl = await getCachedOrCrawl(
          subjectProject.id,
          subjectProject.websiteUrl,
          7,
          {
            timeout: CRAWL_TIMEOUT,
          },
        )

        // Analyze each candidate
        const confirmedAlternatives: Array<{
          project: (typeof candidates)[0]
          score: number
          pros: string[]
          cons: string[]
          useCases: string
        }> = []

        for (const candidate of candidates) {
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

        // Need at least MIN_ALTERNATIVES confirmed alternatives
        if (confirmedAlternatives.length < MIN_ALTERNATIVES) {
          console.log(
            `⏭️  Skipping "${subjectProject.name}": only ${confirmedAlternatives.length} confirmed alternatives (need ${MIN_ALTERNATIVES})`,
          )
          skipped++
          continue
        }

        // Sort by score descending
        confirmedAlternatives.sort((a, b) => b.score - a.score)

        // Generate page content
        const pageContent = await generateAlternativesPageContent(
          {
            name: subjectProject.name,
            description: subjectProject.description,
          },
          confirmedAlternatives.map((a) => ({
            name: a.project.name,
            score: a.score,
            pros: a.pros,
            cons: a.cons,
            useCases: a.useCases,
          })),
        )

        const pageSlug = `${subjectProject.slug}-alternatives`

        // Idempotency check: skip if page already exists for this slug
        const existingPage = await db
          .select({ id: alternativePage.id })
          .from(alternativePage)
          .where(eq(alternativePage.slug, pageSlug))
          .limit(1)

        if (existingPage.length > 0) {
          skipped++
          continue
        }

        // Insert page + relationships in a transaction
        const pageId = crypto.randomUUID()
        await db.transaction(async (tx) => {
          await tx.insert(alternativePage).values({
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
