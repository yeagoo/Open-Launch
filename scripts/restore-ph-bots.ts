/**
 * 恢复 ProductHunt 机器人账号
 * 此脚本只创建 ProductHunt 自动发布使用的5个机器人账号
 *
 * 运行方式: npx tsx scripts/restore-ph-bots.ts
 */

import { db } from "@/drizzle/db"
import { user } from "@/drizzle/db/schema"

// ProductHunt 使用的机器人账号（用于自动发布）
const PRODUCTHUNT_BOTS = [
  { id: "ph-bot-1", name: "ProductHunt Bot 1", email: "ph-bot-1@aat.ee" },
  { id: "ph-bot-2", name: "ProductHunt Bot 2", email: "ph-bot-2@aat.ee" },
  { id: "ph-bot-3", name: "ProductHunt Bot 3", email: "ph-bot-3@aat.ee" },
  { id: "ph-bot-4", name: "ProductHunt Bot 4", email: "ph-bot-4@aat.ee" },
  { id: "ph-bot-5", name: "ProductHunt Bot 5", email: "ph-bot-5@aat.ee" },
]

async function restoreProductHuntBots() {
  console.log("📦 Restoring ProductHunt bot users...")
  console.log("")

  let created = 0
  let existed = 0

  try {
    for (const bot of PRODUCTHUNT_BOTS) {
      try {
        await db.insert(user).values({
          id: bot.id,
          name: bot.name,
          email: bot.email,
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          isBot: true,
          role: "user",
          image: null,
          stripeCustomerId: null,
          banned: false,
          banReason: null,
          banExpires: null,
        })
        console.log(`✅ Created: ${bot.name} (${bot.email})`)
        created++
      } catch (error) {
        if (error instanceof Error && error.message.includes("duplicate")) {
          console.log(`⏭️  Already exists: ${bot.name} (${bot.email})`)
          existed++
        } else {
          throw error
        }
      }
    }

    console.log("")
    console.log("🎉 ProductHunt bot users restoration completed!")
    console.log("")
    console.log("📊 Summary:")
    console.log(`  Created: ${created}`)
    console.log(`  Already existed: ${existed}`)
    console.log(`  Total: ${PRODUCTHUNT_BOTS.length}`)
    console.log("")

    if (created > 0) {
      console.log("✅ ProductHunt auto-import feature is now ready to use")
      console.log("")
      console.log("⚠️  Next step: Update existing ProductHunt projects to use new bot IDs")
      console.log("   Run this SQL if needed:")
      console.log("")
      console.log("   UPDATE project")
      console.log("   SET created_by = 'ph-bot-1'")
      console.log('   WHERE created_by NOT IN (SELECT id FROM "user")')
      console.log("     AND id IN (SELECT project_id FROM product_hunt_import);")
      console.log("")
    }

    process.exit(0)
  } catch (error) {
    console.error("❌ Operation failed:", error)
    process.exit(1)
  }
}

restoreProductHuntBots()
