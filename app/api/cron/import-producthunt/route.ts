import { NextResponse } from "next/server"

import { db } from "@/drizzle/db"
import { productHuntImport, project, user } from "@/drizzle/db/schema"
import { eq } from "drizzle-orm"

import { downloadAndUploadImage } from "@/lib/image-upload"
import {
  cleanDescription,
  extractTags,
  generateSlug,
  getRealWebsiteUrl,
  getTop5Posts,
  type ProductHuntPost,
} from "@/lib/producthunt"

/**
 * ProductHunt 自动导入 Cron Job
 * 每天定时执行，导入当日 Top 5 产品
 */
export async function GET(request: Request) {
  try {
    // 验证 Cron Secret（防止被滥用）
    const authHeader = request.headers.get("authorization")
    const cronSecret = process.env.CRON_SECRET

    if (!cronSecret) {
      console.error("❌ CRON_SECRET is not configured")
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 })
    }

    if (authHeader !== `Bearer ${cronSecret}`) {
      console.error("❌ Unauthorized cron access attempt")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    console.log("🚀 Starting ProductHunt import cron job...")

    // 1. 获取 ProductHunt Top 5
    let posts: ProductHuntPost[]
    try {
      posts = await getTop5Posts()
      console.log(`📦 Fetched ${posts.length} posts from ProductHunt`)
    } catch (error) {
      console.error("❌ Failed to fetch ProductHunt posts:", error)
      return NextResponse.json(
        {
          error: "Failed to fetch ProductHunt data",
          details: error instanceof Error ? error.message : "Unknown error",
        },
        { status: 500 },
      )
    }

    // 2. 获取所有 bot 用户
    const botUsers = await db.select().from(user).where(eq(user.isBot, true)).limit(10)

    if (botUsers.length === 0) {
      console.error("❌ No bot users found in database")
      return NextResponse.json({ error: "No bot users available" }, { status: 500 })
    }

    console.log(`🤖 Found ${botUsers.length} bot users`)

    // 3. 处理每个产品
    const results: Array<{
      name: string
      status: "imported" | "skipped" | "error"
      reason?: string
    }> = []

    for (let i = 0; i < posts.length; i++) {
      const post = posts[i]
      const rank = i + 1

      try {
        // 检查是否已导入（通过 ProductHunt ID）
        const existingImport = await db
          .select()
          .from(productHuntImport)
          .where(eq(productHuntImport.productHuntId, post.id))
          .limit(1)

        if (existingImport.length > 0) {
          console.log(`⏭️  Skipping "${post.name}" (already imported)`)
          results.push({
            name: post.name,
            status: "skipped",
            reason: "Already imported",
          })
          continue
        }

        // 生成 slug 并检查是否冲突
        let slug = generateSlug(post.name)
        const existingProject = await db
          .select()
          .from(project)
          .where(eq(project.slug, slug))
          .limit(1)

        // 如果 slug 冲突，添加随机后缀
        if (existingProject.length > 0) {
          slug = `${slug}-${Date.now().toString(36)}`
        }

        // 选择一个 bot 用户（循环使用）
        const botUser = botUsers[i % botUsers.length]

        // 准备项目数据
        const projectId = crypto.randomUUID()
        const tomorrow = new Date()
        tomorrow.setDate(tomorrow.getDate() + 1)
        tomorrow.setHours(0, 0, 0, 0)

        const tags = extractTags(post.topics)
        const description = cleanDescription(post.description)

        // 获取真实网站地址（跟随 ProductHunt 重定向）
        console.log(`🌐 Getting real website URL for "${post.name}"...`)
        const realWebsiteUrl = await getRealWebsiteUrl(post.website, post.url)
        console.log(`✅ Website URL: ${realWebsiteUrl}`)

        // 下载并上传 logo 到 R2
        let logoUrl = "https://aat.ee/images/default-logo.png"
        let productImageUrl: string | null = null

        if (post.thumbnail?.url) {
          console.log(`📸 Processing logo for "${post.name}"...`)

          // 上传 logo
          const logoResult = await downloadAndUploadImage(
            post.thumbnail.url,
            "logos",
            post.thumbnail.url, // 失败时回退到原始 URL
          )

          if (logoResult.success && logoResult.url) {
            logoUrl = logoResult.url
            productImageUrl = logoResult.url
            console.log(`✅ Logo uploaded: ${logoUrl}`)
          } else {
            console.log(`⚠️  Logo upload failed, using fallback: ${logoResult.error}`)
            logoUrl = post.thumbnail.url // 使用原始 URL 作为回退
            productImageUrl = post.thumbnail.url
          }
        }

        // 创建项目
        await db.insert(project).values({
          id: projectId,
          createdBy: botUser.id,
          name: post.name,
          slug,
          description,
          websiteUrl: realWebsiteUrl,
          logoUrl,
          coverImageUrl: null,
          productImage: productImageUrl,
          githubUrl: null,
          twitterUrl: null,
          techStack: tags,
          pricing: "free",
          platforms: ["web"],
          launchStatus: "scheduled",
          scheduledLaunchDate: tomorrow,
          launchType: "free",
          featuredOnHomepage: false,
          dailyRanking: null,
          hasBadgeVerified: false,
          badgeVerifiedAt: null,
        })

        // 记录导入
        await db.insert(productHuntImport).values({
          id: crypto.randomUUID(),
          productHuntId: post.id,
          productHuntUrl: post.url,
          projectId,
          votesCount: post.votesCount,
          rank,
          importedAt: new Date(),
          createdAt: new Date(),
        })

        console.log(`✅ Imported #${rank}: "${post.name}" (${post.votesCount} votes)`)
        results.push({
          name: post.name,
          status: "imported",
        })
      } catch (error) {
        console.error(`❌ Failed to import "${post.name}":`, error)
        results.push({
          name: post.name,
          status: "error",
          reason: error instanceof Error ? error.message : "Unknown error",
        })
      }
    }

    const imported = results.filter((r) => r.status === "imported").length
    const skipped = results.filter((r) => r.status === "skipped").length
    const errors = results.filter((r) => r.status === "error").length

    console.log(`🎉 Import completed: ${imported} imported, ${skipped} skipped, ${errors} errors`)

    return NextResponse.json(
      {
        success: true,
        timestamp: new Date().toISOString(),
        summary: {
          total: posts.length,
          imported,
          skipped,
          errors,
        },
        results,
      },
      { status: 200 },
    )
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    const errorStack = error instanceof Error ? error.stack : undefined

    console.error("❌ Cron job failed:", errorMessage)
    if (errorStack) {
      console.error("Stack trace:", errorStack)
    }

    return NextResponse.json(
      {
        success: false,
        error: "Cron job failed",
        details: errorMessage,
      },
      { status: 500 },
    )
  }
}
