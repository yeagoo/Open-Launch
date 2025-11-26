import { revalidatePath } from "next/cache"
import { NextResponse } from "next/server"

import { db } from "@/drizzle/db"
import { launchStatus, project, upvote, user } from "@/drizzle/db/schema"
import { and, eq, inArray, sql } from "drizzle-orm"

export const dynamic = "force-dynamic"

/**
 * 模拟 Upvotes Cron Job
 * 定期执行，随机使用 Bot 用户给活跃项目点赞
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const secret = searchParams.get("secret") || request.headers.get("x-cron-secret")

    if (secret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // 1. 获取所有 Bot 用户
    const bots = await db.select().from(user).where(eq(user.isBot, true))

    if (bots.length === 0) {
      return NextResponse.json(
        { message: "No bot users found. Please seed bots first." },
        { status: 200 },
      )
    }

    // 2. 获取活跃项目 (Launched, Ongoing, Scheduled)
    // 随机获取 5 个项目
    const targetProjects = await db
      .select()
      .from(project)
      .where(
        inArray(project.launchStatus, [
          launchStatus.ONGOING,
          launchStatus.LAUNCHED,
          launchStatus.SCHEDULED,
        ]),
      )
      .orderBy(sql`RANDOM()`)
      .limit(5)

    if (targetProjects.length === 0) {
      return NextResponse.json({ message: "No active projects found" }, { status: 200 })
    }

    const results = []

    // 3. 为每个项目随机分配一些 Bot 投票
    for (const proj of targetProjects) {
      // 随机决定是否给这个项目投票 (70% 概率参与)
      if (Math.random() > 0.7) continue

      // 随机决定投多少票 (1-3 票)
      const voteCount = Math.floor(Math.random() * 3) + 1

      // 随机打乱 Bots 列表
      const shuffledBots = [...bots].sort(() => 0.5 - Math.random())
      const selectedBots = shuffledBots.slice(0, voteCount)

      let votesAdded = 0

      for (const bot of selectedBots) {
        // 检查是否已经投过票
        const existingVote = await db
          .select()
          .from(upvote)
          .where(and(eq(upvote.userId, bot.id), eq(upvote.projectId, proj.id)))
          .limit(1)

        if (existingVote.length === 0) {
          await db.insert(upvote).values({
            id: crypto.randomUUID(),
            userId: bot.id,
            projectId: proj.id,
            createdAt: new Date(),
          })
          votesAdded++
        }
      }

      if (votesAdded > 0) {
        results.push({
          project: proj.name,
          votesAdded,
        })
      }
    }

    if (results.length > 0) {
      // 清除缓存以更新 UI
      revalidatePath("/")
      revalidatePath("/trending")
    }

    return NextResponse.json({
      success: true,
      message: "Upvote simulation completed",
      data: results,
    })
  } catch (error) {
    console.error("Simulation error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
