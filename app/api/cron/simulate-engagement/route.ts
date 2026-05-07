import { revalidatePath } from "next/cache"
import { NextResponse } from "next/server"

import { db } from "@/drizzle/db"
import { fumaComments, project, upvote, user } from "@/drizzle/db/schema"
import { and, eq, gte, inArray, lt, sql } from "drizzle-orm"

import { BANNED_OPENINGS, formatCommentContent, generateComment } from "@/lib/ai-comment"
import { verifyCronAuth } from "@/lib/cron-auth"

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

    // 2. Get projects from today and yesterday
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    yesterday.setHours(0, 0, 0, 0)

    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(0, 0, 0, 0)

    const recentProjects = await db
      .select()
      .from(project)
      .where(
        and(
          inArray(project.launchStatus, ["ongoing", "launched"]),
          gte(project.scheduledLaunchDate, yesterday),
          lt(project.scheduledLaunchDate, tomorrow),
        ),
      )

    if (recentProjects.length === 0) {
      return NextResponse.json(
        { message: "No recent projects found to engage with" },
        { status: 200 },
      )
    }

    console.log(`📦 Found ${recentProjects.length} recent projects`)

    const results = {
      upvotesAdded: 0,
      commentsPosted: 0,
      commentsRewritten: 0,
      errors: [] as string[],
    }

    // 3. UPVOTE LOGIC - Random 6 projects, allow duplicates
    const shuffledForUpvotes = [...recentProjects].sort(() => 0.5 - Math.random())
    const projectsToUpvote = shuffledForUpvotes.slice(0, Math.min(6, recentProjects.length))

    console.log(`👍 Processing upvotes for ${projectsToUpvote.length} projects...`)

    for (const proj of projectsToUpvote) {
      // Random 1-3 upvotes per project
      const upvoteCount = Math.floor(Math.random() * 3) + 1
      const shuffledBots = [...bots].sort(() => 0.5 - Math.random())
      const selectedBots = shuffledBots.slice(0, upvoteCount)

      for (const bot of selectedBots) {
        try {
          await db.insert(upvote).values({
            id: crypto.randomUUID(),
            userId: bot.id,
            projectId: proj.id,
            createdAt: new Date(),
          })
          results.upvotesAdded++
          console.log(`  ✅ ${bot.name} upvoted ${proj.name}`)
        } catch {
          // Duplicate upvote, skip silently (this is expected)
          console.log(`  ⏭️  ${bot.name} already upvoted ${proj.name} (skipped)`)
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
    const shuffledForComments = [...recentProjects].sort(() => 0.5 - Math.random())
    const projectsToComment = shuffledForComments.slice(
      0,
      Math.min(commentCount, recentProjects.length),
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
    if (results.upvotesAdded > 0 || results.commentsPosted > 0 || results.commentsRewritten > 0) {
      console.log("🔄 Revalidating cache...")
      revalidatePath("/")
      revalidatePath("/trending")
    }

    console.log("🎉 Virtual engagement simulation completed!")

    return NextResponse.json({
      success: true,
      message: "Virtual engagement simulation completed",
      data: {
        botsAvailable: bots.length,
        projectsFound: recentProjects.length,
        upvotesAdded: results.upvotesAdded,
        commentsPosted: results.commentsPosted,
        commentsRewritten: results.commentsRewritten,
        errors: results.errors,
      },
    })
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
