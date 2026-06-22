import { NextRequest, NextResponse } from "next/server"

import { db } from "@/drizzle/db"
import {
  blogArticle,
  category,
  launchStatus,
  project,
  projectToCategory,
  projectTranslation,
} from "@/drizzle/db/schema"
import { and, count, desc, eq, inArray, like, ne, sql } from "drizzle-orm"

import { generateToolRoundup, type ToolRoundupInput } from "@/lib/ai-content"
import { verifyCronAuth } from "@/lib/cron-auth"
import { cronStatusFromResult } from "@/lib/cron-status"

export const dynamic = "force-dynamic"
export const maxDuration = 120

const MIN_PRODUCTS = 5
const TOP_TOOLS = 8

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
}

/**
 * "Best <category> tools" roundup generator. Each run picks ONE eligible
 * category that doesn't yet have a roundup, pulls its top products from the DB
 * (real names/taglines/pricing/URLs), has DeepSeek write the prose, and stores
 * a DRAFT for human review. Builds coverage over time; returns a no-op once
 * every eligible category has a roundup. Registered weekly.
 */
export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request)
  if (authError) return authError

  try {
    const liveStatuses = [launchStatus.LAUNCHED, launchStatus.ONGOING]
    const liveAndGood = and(
      inArray(project.launchStatus, liveStatuses),
      eq(project.isLowQuality, false),
    )

    // Categories by eligible-product count, most first.
    const counts = await db
      .select({ id: category.id, name: category.name, c: count() })
      .from(projectToCategory)
      .innerJoin(category, eq(category.id, projectToCategory.categoryId))
      .innerJoin(project, eq(project.id, projectToCategory.projectId))
      .where(liveAndGood)
      .groupBy(category.id, category.name)
      .orderBy(desc(count()))

    // Skip categories that already have a roundup (any status) — build coverage.
    const existing = await db
      .select({ slug: blogArticle.slug })
      .from(blogArticle)
      .where(like(blogArticle.slug, "best-%-tools"))
    const covered = new Set(existing.map((e) => e.slug))

    const target = counts
      .filter((c) => Number(c.c) >= MIN_PRODUCTS)
      .find((c) => !covered.has(`best-${slugify(c.name)}-tools`))

    if (!target) {
      return NextResponse.json(
        { ok: true, skipped: "all eligible categories already have a roundup" },
        { status: 200 },
      )
    }

    const slug = `best-${slugify(target.name)}-tools`

    // Top tools in the category: ranked daily winners first, then most recent.
    const tools = await db
      .select({
        name: project.name,
        url: project.websiteUrl,
        pricing: project.pricing,
        tagline: projectTranslation.tagline,
      })
      .from(projectToCategory)
      .innerJoin(project, eq(project.id, projectToCategory.projectId))
      .leftJoin(
        projectTranslation,
        and(eq(projectTranslation.projectId, project.id), eq(projectTranslation.isSource, true)),
      )
      .where(and(eq(projectToCategory.categoryId, target.id), liveAndGood))
      .orderBy(sql`${project.dailyRanking} asc nulls last`, desc(project.createdAt))
      .limit(TOP_TOOLS)

    const roundupData: ToolRoundupInput = {
      category: target.name,
      tools: tools.map((t) => ({
        name: t.name,
        tagline: t.tagline ?? null,
        pricing: t.pricing ?? null,
        url: t.url,
      })),
    }

    const year = new Date().getUTCFullYear()
    const title = `Best ${target.name} Tools (${year})`
    const description = `A curated roundup of the best ${target.name} tools, from products listed on aat.ee.`
    const body = (await generateToolRoundup(roundupData)).trim()
    const nowDate = new Date()

    await db
      .insert(blogArticle)
      .values({
        id: `blog-${slug}`,
        slug,
        title,
        description,
        content: body,
        tags: ["Roundup", target.name],
        author: "aat.ee Team",
        status: "draft",
        publishedAt: nowDate,
      })
      .onConflictDoUpdate({
        target: blogArticle.slug,
        set: { title, description, content: body, status: "draft", updatedAt: nowDate },
        // Never revert a human-published roundup back to draft.
        setWhere: ne(blogArticle.status, "published"),
      })

    console.log(`[blog-roundup] draft saved: ${slug} (${tools.length} tools in "${target.name}")`)
    return NextResponse.json(
      { ok: true, slug, category: target.name, tools: tools.length },
      { status: cronStatusFromResult({ errorCount: 0, successCount: 1 }) },
    )
  } catch (err) {
    console.error("[blog-roundup] failed:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
