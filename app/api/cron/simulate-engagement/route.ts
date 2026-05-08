import { revalidatePath } from "next/cache"
import { NextResponse } from "next/server"

import { db } from "@/drizzle/db"
import { fumaComments, project, upvote, user } from "@/drizzle/db/schema"
import { and, eq, gte, inArray, isNull, or, sql } from "drizzle-orm"

import { BANNED_OPENINGS, formatCommentContent, generateComment } from "@/lib/ai-comment"
import { verifyCronAuth } from "@/lib/cron-auth"

// How many stale templated bot comments to rewrite per cron tick. The
// historical backlog (~2.5k templated comments from the pre-diversity prompt)
// is amortised across cron runs rather than blasted in one shot.
const REWRITES_PER_RUN = 3

// Upvote phase tuning. The cron is scheduled "0 */2 * * *" — every 2 hours —
// so we look back exactly 2 hours when counting real-user upvotes to amplify.
// AMP_LOOKBACK_HOURS matches the cron interval to avoid overlapping (which
// would double-amp the same real vote) and to avoid gaps as long as the cron
// fires on time. AMP_CAP caps how many bot votes a single project can earn
// per tick so a HN-spike doesn't trigger a 100-vote bot avalanche.
const AMP_LOOKBACK_HOURS = 2
const AMP_CAP_PER_PROJECT = 20
// Base cadence: pick a few ongoing projects and seed bot upvotes regardless
// of real-user activity. Keeps cold-start projects feeling alive.
const BASE_CADENCE_MAX_PROJECTS = 6

export const dynamic = "force-dynamic"

/**
 * Virtual Engagement Cron Job
 * Simulates upvotes and comments on recent projects using bot users
 */
export async function GET(request: Request) {
  try {
    const authError = verifyCronAuth(request)
    if (authError) return authError

    console.log("🤖 Starting virtual engagement simulation...")

    // 1. Get all bot users
    const bots = await db.select().from(user).where(eq(user.isBot, true))

    if (bots.length === 0) {
      return NextResponse.json(
        { message: "No bot users found. Please seed bots first." },
        { status: 200 },
      )
    }

    console.log(`✅ Found ${bots.length} bot users`)

    // Both bot upvotes and bot comments now scope to today's active
    // launches only. Real users may comment on closed launches, but bot
    // chatter on yesterday's threads doesn't add credibility — it just
    // moves the spam clock forward, and the new diversity prompt makes
    // ongoing-day comments plenty rich on their own.
    const ongoingProjects = await db
      .select()
      .from(project)
      .where(eq(project.launchStatus, "ongoing"))

    if (ongoingProjects.length === 0) {
      return NextResponse.json(
        { message: "No ongoing projects found to engage with" },
        { status: 200 },
      )
    }

    console.log(`📦 ${ongoingProjects.length} ongoing projects (vote + comment scope)`)

    const results = {
      upvotesAdded: 0,
      upvotesAmplified: 0,
      commentsPosted: 0,
      commentsRewritten: 0,
      errors: [] as string[],
    }

    // Helper: insert a single bot upvote. Postgres unique-violation (SQLSTATE
    // 23505) is the expected duplicate and stays silent; everything else
    // (connection blip, FK error, etc.) is logged so the cron doesn't hide
    // real bugs as "just another duplicate".
    async function castBotUpvote(botId: string, projectId: string): Promise<boolean> {
      try {
        await db.insert(upvote).values({
          id: crypto.randomUUID(),
          userId: botId,
          projectId,
          createdAt: new Date(),
        })
        return true
      } catch (err) {
        const code = (err as { code?: string })?.code
        if (code !== "23505") {
          console.error(`upvote insert failed (bot=${botId}, project=${projectId}):`, err)
        }
        return false
      }
    }

    // Helper: pick `count` bots from `bots` that haven't already upvoted
    // `projectId`. Cuts down on duplicate-insert noise vs blind sampling.
    async function pickAvailableBots(projectId: string, count: number) {
      if (count <= 0) return []
      const already = await db
        .select({ userId: upvote.userId })
        .from(upvote)
        .where(
          and(
            eq(upvote.projectId, projectId),
            inArray(
              upvote.userId,
              bots.map((b) => b.id),
            ),
          ),
        )
      const usedIds = new Set(already.map((r) => r.userId))
      const available = bots.filter((b) => !usedIds.has(b.id))
      return [...available].sort(() => 0.5 - Math.random()).slice(0, count)
    }

    // 3a. UPVOTE BASE CADENCE — only ongoing projects, 1-3 random bot votes
    // each so cold-start launches feel populated even with no real traffic.
    if (ongoingProjects.length > 0) {
      const shuffledForUpvotes = [...ongoingProjects].sort(() => 0.5 - Math.random())
      const projectsToUpvote = shuffledForUpvotes.slice(
        0,
        Math.min(BASE_CADENCE_MAX_PROJECTS, ongoingProjects.length),
      )
      console.log(`👍 Base cadence: ${projectsToUpvote.length} projects`)

      for (const proj of projectsToUpvote) {
        const baseCount = Math.floor(Math.random() * 3) + 1 // 1..3
        const selected = await pickAvailableBots(proj.id, baseCount)
        for (const bot of selected) {
          const ok = await castBotUpvote(bot.id, proj.id)
          if (ok) {
            results.upvotesAdded++
            console.log(`  ✅ ${bot.name} upvoted ${proj.name}`)
          }
        }
      }
    }

    // 3b. UPVOTE 1:1 AMPLIFICATION — for each ongoing project, count how many
    // real-user upvotes landed in the last AMP_LOOKBACK_HOURS hours and add
    // a matching number of bot upvotes (capped at AMP_CAP_PER_PROJECT). The
    // 2-hour lookback equals the cron interval so windows neither overlap
    // (avoiding double-amp) nor leave gaps when the cron fires on schedule.
    if (ongoingProjects.length > 0) {
      const since = new Date(Date.now() - AMP_LOOKBACK_HOURS * 60 * 60 * 1000)
      const ongoingIds = ongoingProjects.map((p) => p.id)

      const realUpvoteRows = await db
        .select({ projectId: upvote.projectId })
        .from(upvote)
        .innerJoin(user, eq(user.id, upvote.userId))
        .where(
          and(
            inArray(upvote.projectId, ongoingIds),
            gte(upvote.createdAt, since),
            // Treat NULL is_bot as "not a bot". Better Auth signups occasionally
            // bypass the column default depending on adapter, so a strict
            // `is_bot = false` would silently drop those users' real upvotes
            // out of the amplification count.
            or(eq(user.isBot, false), isNull(user.isBot)),
          ),
        )

      const realCounts = new Map<string, number>()
      for (const r of realUpvoteRows) {
        realCounts.set(r.projectId, (realCounts.get(r.projectId) ?? 0) + 1)
      }

      console.log(
        `🔁 Amp scan: ${realUpvoteRows.length} real upvotes in last ${AMP_LOOKBACK_HOURS}h across ${realCounts.size} projects`,
      )

      for (const proj of ongoingProjects) {
        const realCount = realCounts.get(proj.id) ?? 0
        if (realCount === 0) continue
        const ampTarget = Math.min(realCount, AMP_CAP_PER_PROJECT)
        const selected = await pickAvailableBots(proj.id, ampTarget)
        let amped = 0
        for (const bot of selected) {
          const ok = await castBotUpvote(bot.id, proj.id)
          if (ok) amped++
        }
        if (amped > 0) {
          results.upvotesAmplified += amped
          console.log(`  ✨ ${proj.name}: real=${realCount} amped=${amped}`)
        }
      }
    }

    // 4. COMMENT LOGIC — 5 unique bots cycle across 2-5 projects.
    // Comment volume bumped ~75% over the previous 1-3 to make threads feel
    // populated; persona/intent/language variety happens inside generateComment.
    console.log(`💬 Processing comments...`)

    const shuffledBotsForComments = [...bots].sort(() => 0.5 - Math.random())
    const botsForComments = shuffledBotsForComments.slice(0, Math.min(5, bots.length))

    const commentCount = Math.floor(Math.random() * 4) + 2 // 2..5
    const shuffledForComments = [...ongoingProjects].sort(() => 0.5 - Math.random())
    const projectsToComment = shuffledForComments.slice(
      0,
      Math.min(commentCount, ongoingProjects.length),
    )

    for (let i = 0; i < projectsToComment.length; i++) {
      const proj = projectsToComment[i]
      const bot = botsForComments[i % botsForComments.length] // Cycle through the 3 bots

      try {
        // Check if this bot has already commented on this project
        const existingComment = await db
          .select()
          .from(fumaComments)
          .where(and(eq(fumaComments.page, proj.id), eq(fumaComments.author, bot.id)))
          .limit(1)

        if (existingComment.length > 0) {
          console.log(`  ⏭️  ${bot.name} already commented on ${proj.name} (skipped)`)
          continue
        }

        // Generate AI comment
        console.log(`  🤖 Generating comment for ${proj.name}...`)
        const commentText = await generateComment(
          proj.name,
          proj.description.substring(0, 200), // Use first 200 chars as tagline
          proj.description,
        )

        console.log(`  💭 Generated: "${commentText}"`)

        // Format and insert comment
        const commentContent = formatCommentContent(commentText)

        await db.insert(fumaComments).values({
          page: proj.id,
          author: bot.id,
          content: commentContent,
          thread: null,
        })

        results.commentsPosted++
        console.log(`  ✅ ${bot.name} commented on ${proj.name}`)
      } catch (error) {
        const errorMsg = `Failed to comment on ${proj.name}: ${error instanceof Error ? error.message : "Unknown error"}`
        console.error(`  ❌ ${errorMsg}`)
        results.errors.push(errorMsg)
      }
    }

    // 4.5. STALE COMMENT REWRITE — pick a few old templated bot comments
    // (matching the pre-diversity-prompt opening list) and regenerate them
    // with the current generator. We skip threads where the bot received
    // a real reply, since rewriting the parent would orphan the reply's
    // context.
    console.log(`🔄 Rewriting up to ${REWRITES_PER_RUN} stale comments...`)

    // Build a regex pattern from BANNED_OPENINGS for PG ~* (case-insensitive)
    // matching. Escape regex metachars so " a-z " openings stay literal.
    const escapedOpenings = BANNED_OPENINGS.map((o) =>
      o.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    ).join("|")
    const stalePattern = `^(${escapedOpenings})`

    const staleCandidates = await db.execute<{
      id: number
      page: string
      author: string
      text: string
    }>(sql`
      SELECT
        c.id,
        c.page,
        c.author,
        c.content->'content'->0->'content'->0->>'text' AS text
      FROM ${fumaComments} c
      JOIN ${user} u ON u.id = c.author
      WHERE u.is_bot = true
        AND NOT EXISTS (
          SELECT 1 FROM ${fumaComments} r WHERE r.thread = c.id
        )
        AND (c.content->'content'->0->'content'->0->>'text') ~* ${stalePattern}
      ORDER BY c.timestamp ASC
      LIMIT ${REWRITES_PER_RUN}
    `)

    const staleRows =
      (
        staleCandidates as unknown as {
          rows?: Array<{ id: number; page: string; author: string; text: string }>
        }
      ).rows ??
      (staleCandidates as unknown as Array<{
        id: number
        page: string
        author: string
        text: string
      }>)

    for (const row of staleRows) {
      try {
        const [proj] = await db
          .select({ id: project.id, name: project.name, description: project.description })
          .from(project)
          .where(eq(project.id, row.page))
          .limit(1)

        if (!proj) {
          // Project gone — leave the orphan comment alone.
          continue
        }

        const newText = await generateComment(
          proj.name,
          proj.description.substring(0, 200),
          proj.description,
        )

        // Update only the content; keep timestamp + author so the comment
        // stays in its original position in the thread.
        await db
          .update(fumaComments)
          .set({ content: formatCommentContent(newText) })
          .where(eq(fumaComments.id, row.id))

        results.commentsRewritten++
        console.log(`  ✏️  rewrote #${row.id} on ${proj.name}: "${newText.slice(0, 60)}…"`)
      } catch (err) {
        const msg = `Failed to rewrite #${row.id}: ${err instanceof Error ? err.message : err}`
        console.error(`  ❌ ${msg}`)
        results.errors.push(msg)
      }
    }

    // 5. Revalidate cache
    if (
      results.upvotesAdded > 0 ||
      results.upvotesAmplified > 0 ||
      results.commentsPosted > 0 ||
      results.commentsRewritten > 0
    ) {
      console.log("🔄 Revalidating cache...")
      revalidatePath("/")
      revalidatePath("/trending")
    }

    console.log("🎉 Virtual engagement simulation completed!")

    // Surface complete-failure runs as HTTP 5xx so cron-job.org's failure
    // alerting actually fires when DeepSeek/Crawl4AI is down. Partial runs
    // (some work succeeded, some errored) stay 200 — those are usually
    // transient and not worth a page.
    const totalWork =
      results.upvotesAdded +
      results.upvotesAmplified +
      results.commentsPosted +
      results.commentsRewritten
    const status = results.errors.length > 0 && totalWork === 0 ? 500 : 200

    return NextResponse.json(
      {
        success: status === 200,
        message: "Virtual engagement simulation completed",
        data: {
          botsAvailable: bots.length,
          ongoingProjects: ongoingProjects.length,
          upvotesAdded: results.upvotesAdded,
          upvotesAmplified: results.upvotesAmplified,
          commentsPosted: results.commentsPosted,
          commentsRewritten: results.commentsRewritten,
          errors: results.errors,
        },
      },
      { status },
    )
  } catch (error) {
    console.error("❌ Simulation error:", error)
    return NextResponse.json(
      {
        error: "Internal Server Error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
