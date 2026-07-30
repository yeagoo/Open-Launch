import { NextRequest, NextResponse } from "next/server"

import { db } from "@/drizzle/db"
import {
  blogArticle,
  category,
  launchStatus,
  project,
  projectToCategory,
} from "@/drizzle/db/schema"
import { and, count, desc, eq, gte, inArray, lt, ne } from "drizzle-orm"

import { generateLaunchRecap, type LaunchRecapInput } from "@/lib/ai-content"
import { verifyCronAuth } from "@/lib/cron-auth"
import {
  parseCronScheduledFor,
  previousUtcCalendarMonth,
  sanitizeCronJobError,
} from "@/lib/cron-ledger-core"
import { cronStatusFromResult } from "@/lib/cron-status"
import { logger } from "@/lib/observability/structured-logger"

export const dynamic = "force-dynamic"
export const maxDuration = 120

/**
 * Monthly "launch recap" blog generator. Pulls last calendar month's launch
 * data from the DB (real numbers), has DeepSeek write prose around it, and
 * stores the result as a DRAFT (status='draft', unlisted) for human review —
 * it never auto-publishes and never overwrites an already-published recap.
 * Registered to run on the 1st of each month.
 */
export async function GET(request: NextRequest) {
  const startedAt = Date.now()
  const requestId = request.headers.get("x-aat-request-id")
  const authError = verifyCronAuth(request)
  if (authError) return authError

  try {
    // Previous calendar month, in UTC.
    // Ledger recovery passes the original scheduled minute. Legacy calls do
    // not include the header and retain the current-time behavior.
    const now = new Date()
    const scheduledFor =
      parseCronScheduledFor(request.headers.get("x-aat-cron-scheduled-for"), now, 43_200) ?? now
    const { windowStart, windowEnd, monthLabel, slugSuffix } =
      previousUtcCalendarMonth(scheduledFor)
    const slug = `launch-recap-${slugSuffix}`

    // Never clobber a recap a human already reviewed + published.
    const [existing] = await db
      .select({ status: blogArticle.status })
      .from(blogArticle)
      .where(eq(blogArticle.slug, slug))
      .limit(1)
    if (existing?.status === "published") {
      return NextResponse.json({ ok: true, skipped: "already published", slug }, { status: 200 })
    }

    const launchedInWindow = and(
      eq(project.launchStatus, launchStatus.LAUNCHED),
      gte(project.scheduledLaunchDate, windowStart),
      lt(project.scheduledLaunchDate, windowEnd),
    )

    const [{ total }] = await db.select({ total: count() }).from(project).where(launchedInWindow)
    const totalLaunches = Number(total)
    if (totalLaunches === 0) {
      return NextResponse.json(
        { ok: true, skipped: "no launches in window", slug, monthLabel },
        { status: 200 },
      )
    }

    // Daily winners (rank 1) of the month — bounded, meaningful "top launches".
    const winners = await db
      .select({ id: project.id, name: project.name, rank: project.dailyRanking })
      .from(project)
      .where(and(launchedInWindow, eq(project.dailyRanking, 1)))
      .orderBy(desc(project.scheduledLaunchDate))
      .limit(10)

    // First category per winner (one query, deduped in JS).
    const catByProject = new Map<string, string>()
    if (winners.length > 0) {
      const cats = await db
        .select({ pid: projectToCategory.projectId, name: category.name })
        .from(projectToCategory)
        .innerJoin(category, eq(category.id, projectToCategory.categoryId))
        .where(
          inArray(
            projectToCategory.projectId,
            winners.map((w) => w.id),
          ),
        )
      for (const c of cats) if (!catByProject.has(c.pid)) catByProject.set(c.pid, c.name)
    }

    const topCats = await db
      .select({ name: category.name, c: count() })
      .from(projectToCategory)
      .innerJoin(project, eq(project.id, projectToCategory.projectId))
      .innerJoin(category, eq(category.id, projectToCategory.categoryId))
      .where(launchedInWindow)
      .groupBy(category.name)
      .orderBy(desc(count()))
      .limit(5)

    const recapData: LaunchRecapInput = {
      monthLabel,
      totalLaunches,
      topProducts: winners.map((w) => ({
        name: w.name,
        tagline: null,
        category: catByProject.get(w.id) ?? null,
        rank: w.rank,
      })),
      topCategories: topCats.map((c) => ({ name: c.name, count: Number(c.c) })),
    }

    const body = (await generateLaunchRecap(recapData)).trim()
    const nowDate = new Date()
    await db
      .insert(blogArticle)
      .values({
        id: `blog-${slug}`,
        slug,
        title: `Launch Recap: ${monthLabel}`,
        description: `The top product launches on aat.ee in ${monthLabel}.`,
        content: body,
        tags: ["Launch Recap", "Trends"],
        author: "aat.ee Team",
        status: "draft",
        publishedAt: nowDate,
      })
      .onConflictDoUpdate({
        target: blogArticle.slug,
        set: {
          title: `Launch Recap: ${monthLabel}`,
          description: `The top product launches on aat.ee in ${monthLabel}.`,
          content: body,
          status: "draft",
          updatedAt: nowDate,
        },
        // Atomic no-clobber: if a reviewer published this recap while we were
        // waiting on DeepSeek, the upsert must NOT revert it to draft. The
        // earlier status check is a fast path; this where is the real guard.
        setWhere: ne(blogArticle.status, "published"),
      })

    logger.info("blog_recap_draft_saved", {
      requestId,
      route: "/api/cron/generate-blog-recap",
      status: 200,
      durationMs: Date.now() - startedAt,
      provider: "deepseek",
      context: { slug, totalLaunches, winners: winners.length },
    })
    return NextResponse.json(
      { ok: true, slug, monthLabel, totalLaunches, winners: winners.length },
      { status: cronStatusFromResult({ errorCount: 0, successCount: 1 }) },
    )
  } catch (err) {
    logger.error("blog_recap_failed", {
      requestId,
      route: "/api/cron/generate-blog-recap",
      status: 500,
      durationMs: Date.now() - startedAt,
      provider: "deepseek",
      context: { message: sanitizeCronJobError(err) },
      error: err,
    })
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
