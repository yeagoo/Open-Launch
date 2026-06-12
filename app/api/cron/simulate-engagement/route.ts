import { revalidatePath } from "next/cache"
import { NextResponse } from "next/server"

import { db } from "@/drizzle/db"
import { fumaComments, launchStatus, project, upvote, user } from "@/drizzle/db/schema"
import { and, eq, gte, inArray, lt, sql } from "drizzle-orm"

import { BANNED_OPENINGS, formatCommentContent, generateComment } from "@/lib/ai-comment"
import { dailyVoteTarget, isPaidLaunchType, votesDueByNow } from "@/lib/bot-upvote-plan"
import { verifyCronAuth } from "@/lib/cron-auth"
import { cronStatusFromResult } from "@/lib/cron-status"
import { getCurrentLaunchWindow } from "@/lib/launch-window"

// How many stale templated bot comments to rewrite per cron tick. The
// historical backlog (~2.5k templated comments from the pre-diversity prompt)
// is amortised across cron runs rather than blasted in one shot.
const REWRITES_PER_RUN = 3

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

    const { start: launchWindowStart, end: launchWindowEnd } = getCurrentLaunchWindow()

    // Both bot upvotes and bot comments now scope to today's active
    // launches only. Real users may comment on closed launches, but bot
    // chatter on yesterday's threads doesn't add credibility — it just
    // moves the spam clock forward, and the new diversity prompt makes
    // ongoing-day comments plenty rich on their own.
    // Exclude projects flagged by the AI quality classifier — they're
    // intentionally cut off from every AI feature, including the bot
    // engagement and rewrite phases below.
    const ongoingProjects = await db
      .select()
      .from(project)
      .where(
        and(
          eq(project.launchStatus, launchStatus.ONGOING),
          eq(project.isLowQuality, false),
          gte(project.scheduledLaunchDate, launchWindowStart),
          lt(project.scheduledLaunchDate, launchWindowEnd),
        ),
      )

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

    // 3a. DAILY UPVOTE DISTRIBUTION — per-project vote targets that ramp
    // through the launch window.
    //
    // Every project is assigned a deterministic daily target (see
    // lib/bot-upvote-plan): the free queue lands in [50, 200] and paid
    // launches (premium / premium_plus) are guaranteed [200, 250]. The target
    // is keyed on (projectId, windowStart, tier) so it stays stable across the
    // day's cron ticks instead of jerking around with Math.random.
    //
    // Each tick tops a project up to the number of votes that *should* exist by
    // now — a linear ramp from 0 at the window open to the full target at the
    // window close — so counts climb smoothly over the day rather than getting
    // blasted to 200 the instant a launch goes live. Real-user votes count
    // toward the target, so bots only ever fill the remaining gap, and the
    // per-(user,project) unique index caps each bot at one vote per project.
    if (ongoingProjects.length > 0) {
      const nowMs = Date.now()
      const windowStartMs = launchWindowStart.getTime()
      const windowEndMs = launchWindowEnd.getTime()
      const botIds = new Set(bots.map((b) => b.id))

      // Current vote rows (real + bot) for every ongoing project in one pass.
      const existingVotes = await db
        .select({ projectId: upvote.projectId, userId: upvote.userId })
        .from(upvote)
        .where(
          inArray(
            upvote.projectId,
            ongoingProjects.map((p) => p.id),
          ),
        )

      const totalVotes = new Map<string, number>()
      const botVoters = new Map<string, Set<string>>()
      for (const row of existingVotes) {
        totalVotes.set(row.projectId, (totalVotes.get(row.projectId) ?? 0) + 1)
        if (botIds.has(row.userId)) {
          const set = botVoters.get(row.projectId) ?? new Set<string>()
          set.add(row.userId)
          botVoters.set(row.projectId, set)
        }
      }

      const pending: Array<{ id: string; userId: string; projectId: string; createdAt: Date }> = []

      for (const proj of ongoingProjects) {
        const isPaid = isPaidLaunchType(proj.launchType)
        const target = dailyVoteTarget(proj.id, windowStartMs, isPaid)
        const due = votesDueByNow(target, windowStartMs, windowEndMs, nowMs)
        const current = totalVotes.get(proj.id) ?? 0
        const alreadyVoted = botVoters.get(proj.id) ?? new Set<string>()
        const eligibleBots = bots.filter((b) => !alreadyVoted.has(b.id))

        // Only fill the gap, capped by bots that haven't voted on this project.
        const need = Math.min(Math.max(due - current, 0), eligibleBots.length)
        if (need === 0) continue

        for (const bot of shuffle(eligibleBots).slice(0, need)) {
          pending.push({
            id: crypto.randomUUID(),
            userId: bot.id,
            projectId: proj.id,
            createdAt: new Date(),
          })
        }

        console.log(
          `  👍 ${proj.name}${isPaid ? " (paid)" : ""}: target ${target}, due ${due}, have ${current} → +${need}`,
        )
      }

      if (pending.length > 0) {
        // Single batch insert; onConflictDoNothing absorbs the rare race where a
        // real user voted between the read above and this write.
        await db.insert(upvote).values(pending).onConflictDoNothing()
        results.upvotesAdded += pending.length
      }

      console.log(
        `👍 Daily distribution: +${pending.length} bot votes across ${ongoingProjects.length} projects (${launchWindowStart.toISOString()} → ${launchWindowEnd.toISOString()})`,
      )
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
          { caller: "new" },
        )

        console.log(`  💭 Generated: "${commentText}"`)

        // Format and insert comment
        const commentContent = formatCommentContent(commentText)

        // onConflictDoNothing pairs with the partial unique index on
        // (page, author) for bot authors: a retried/overlapping cron run
        // can't post a duplicate bot comment on the same project. `returning`
        // lets us count only rows actually inserted (a skipped conflict
        // returns nothing) so metrics reflect real work.
        const inserted = await db
          .insert(fumaComments)
          .values({
            page: proj.id,
            author: bot.id,
            content: commentContent,
            thread: null,
          })
          .onConflictDoNothing()
          .returning({ id: fumaComments.id })

        if (inserted.length === 0) {
          console.log(`  ⏭️  ${bot.name} already commented on ${proj.name} (conflict, skipped)`)
          continue
        }

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
      JOIN ${project} p ON p.id = c.page
      WHERE u.is_bot = true
        AND p.is_low_quality = false
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
          { caller: "rewrite" },
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

    const status = cronStatusFromResult({
      errorCount: results.errors.length,
      successCount:
        results.upvotesAdded +
        results.upvotesAmplified +
        results.commentsPosted +
        results.commentsRewritten,
    })

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

function shuffle<T>(items: readonly T[]): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}
