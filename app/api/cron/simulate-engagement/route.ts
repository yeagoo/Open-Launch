import { revalidatePath } from "next/cache"
import { NextResponse } from "next/server"

import { db } from "@/drizzle/db"
import { fumaComments, project, upvote, user } from "@/drizzle/db/schema"
import { and, eq, gte, inArray, lt } from "drizzle-orm"

import { formatCommentContent, generateComment } from "@/lib/ai-comment"

export const dynamic = "force-dynamic"

/**
 * Virtual Engagement Cron Job
 * Simulates upvotes and comments on recent projects using bot users
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const secret = searchParams.get("secret") || request.headers.get("x-cron-secret")

    if (secret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

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

    // 4. COMMENT LOGIC - 3 different bot users, 1-3 projects
    console.log(`💬 Processing comments...`)

    // Select 3 unique bot users for comments
    const shuffledBotsForComments = [...bots].sort(() => 0.5 - Math.random())
    const botsForComments = shuffledBotsForComments.slice(0, Math.min(3, bots.length))

    // Select 1-3 projects to comment on
    const commentCount = Math.floor(Math.random() * 3) + 1
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
          .where(and(eq(fumaComments.page, proj.slug), eq(fumaComments.author, bot.id)))
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
          page: proj.slug,
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

    // 5. Revalidate cache
    if (results.upvotesAdded > 0 || results.commentsPosted > 0) {
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
