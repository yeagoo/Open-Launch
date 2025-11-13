/**
 * 种子脚本：创建 ProductHunt 导入所需的 bot 用户
 * 运行方式: npx tsx scripts/seed-bot-users.ts
 */

import { db } from "@/drizzle/db"
import { user } from "@/drizzle/db/schema"

const BOT_USERS = [
  {
    id: "bot-user-ph-1",
    name: "TechHunter",
    email: "bot-ph-1@aat.ee",
  },
  {
    id: "bot-user-ph-2",
    name: "ProductScout",
    email: "bot-ph-2@aat.ee",
  },
  {
    id: "bot-user-ph-3",
    name: "LaunchTracker",
    email: "bot-ph-3@aat.ee",
  },
  {
    id: "bot-user-ph-4",
    name: "StartupDigger",
    email: "bot-ph-4@aat.ee",
  },
  {
    id: "bot-user-ph-5",
    name: "InnoFinder",
    email: "bot-ph-5@aat.ee",
  },
]

async function seedBotUsers() {
  console.log("🤖 Starting bot users seed...")

  try {
    for (const botUser of BOT_USERS) {
      try {
        await db.insert(user).values({
          id: botUser.id,
          name: botUser.name,
          email: botUser.email,
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
        console.log(`✅ Created bot user: ${botUser.name} (${botUser.email})`)
      } catch (error) {
        // 如果用户已存在，忽略错误
        if (error instanceof Error && error.message.includes("duplicate")) {
          console.log(`⏭️  Bot user already exists: ${botUser.name}`)
        } else {
          throw error
        }
      }
    }

    console.log("🎉 Bot users seed completed!")
    process.exit(0)
  } catch (error) {
    console.error("❌ Seed failed:", error)
    process.exit(1)
  }
}

seedBotUsers()
