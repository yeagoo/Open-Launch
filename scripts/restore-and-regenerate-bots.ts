/**
 * 恢复和重新生成机器人用户
 * 此脚本会：
 * 1. 重新创建 ProductHunt 使用的机器人账号（如果被删除）
 * 2. 生成80个新的虚拟互动机器人用户
 *
 * 运行方式: npx tsx scripts/restore-and-regenerate-bots.ts
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

// 虚拟互动使用的机器人账号
const FIRST_NAMES = [
  "Alex",
  "Blake",
  "Casey",
  "Drew",
  "Evan",
  "Finn",
  "Grey",
  "Harper",
  "Indie",
  "Jules",
  "Kai",
  "Lane",
  "Morgan",
  "Nico",
  "Onyx",
  "Parker",
  "Quinn",
  "River",
  "Sage",
  "Taylor",
  "Uma",
  "Vale",
  "West",
  "Xan",
  "Yara",
  "Zara",
  "Aiden",
  "Brook",
  "Cedar",
  "Dale",
  "Eden",
  "Fox",
  "Glen",
  "Hunter",
  "Ivy",
  "Jay",
  "Kit",
  "Lake",
  "Max",
  "Nova",
  "Ocean",
  "Page",
  "Rain",
  "Sky",
  "Terra",
  "Urban",
  "Vita",
  "Wave",
  "Azure",
  "Blaze",
  "Cloud",
  "Dawn",
  "Echo",
  "Frost",
  "Grace",
  "Haven",
  "Iris",
  "Jazz",
  "Leaf",
  "Moon",
  "North",
  "Opal",
  "Pearl",
  "Quest",
  "Reed",
  "Star",
  "Tide",
  "Unity",
  "Verse",
  "Wind",
  "Ash",
  "Bay",
  "Clay",
  "Dusk",
  "Elm",
  "Flint",
  "Gage",
  "Heath",
  "Jade",
  "Knox",
]

const LAST_NAMES = [
  // 欧美姓氏 (30个)
  "Smith",
  "Johnson",
  "Williams",
  "Brown",
  "Jones",
  "Garcia",
  "Miller",
  "Davis",
  "Rodriguez",
  "Martinez",
  "Anderson",
  "Taylor",
  "Thomas",
  "Moore",
  "Jackson",
  "Martin",
  "Lee",
  "Thompson",
  "White",
  "Harris",
  "Clark",
  "Lewis",
  "Walker",
  "Hall",
  "Allen",
  "Young",
  "King",
  "Wright",
  "Scott",
  "Green",
  // 亚洲姓氏 (30个)
  "Chen",
  "Wang",
  "Li",
  "Zhang",
  "Liu",
  "Yang",
  "Huang",
  "Wu",
  "Zhou",
  "Xu",
  "Sun",
  "Ma",
  "Zhu",
  "Hu",
  "Guo",
  "He",
  "Kim",
  "Park",
  "Choi",
  "Jung",
  "Kang",
  "Cho",
  "Yoon",
  "Jang",
  "Tanaka",
  "Suzuki",
  "Takahashi",
  "Watanabe",
  "Ito",
  "Yamamoto",
  // 拉美姓氏 (20个)
  "Gonzalez",
  "Hernandez",
  "Lopez",
  "Perez",
  "Sanchez",
  "Ramirez",
  "Torres",
  "Flores",
  "Rivera",
  "Gomez",
  "Diaz",
  "Cruz",
  "Morales",
  "Reyes",
  "Gutierrez",
  "Ortiz",
  "Alvarez",
  "Castillo",
  "Ruiz",
  "Mendoza",
]

const ROLES = [
  "Developer",
  "Designer",
  "Entrepreneur",
  "Product Manager",
  "Engineer",
  "Founder",
  "Maker",
  "Creator",
]

const ENGAGEMENT_BOTS = Array.from({ length: 80 }, (_, i) => {
  const num = i + 1
  const firstNameIndex = i % FIRST_NAMES.length
  const lastNameIndex = (i * 7 + 13) % LAST_NAMES.length
  const roleIndex = i % ROLES.length

  return {
    id: `engagement-bot-${num}`,
    name: `${FIRST_NAMES[firstNameIndex]} ${LAST_NAMES[lastNameIndex]}`,
    email: `bot${num}@aat.ee`,
    role: ROLES[roleIndex],
  }
})

async function restoreAndRegenerateBots() {
  console.log("🤖 Starting bot users restoration and regeneration...")
  console.log("")

  let phCreated = 0
  let phExisted = 0
  let engagementCreated = 0
  let engagementExisted = 0

  try {
    // 第一步：恢复/创建 ProductHunt 机器人
    console.log("📦 Step 1: Restoring ProductHunt bot users...")
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
        console.log(`  ✅ Created: ${bot.name} (${bot.email})`)
        phCreated++
      } catch (error) {
        if (error instanceof Error && error.message.includes("duplicate")) {
          console.log(`  ⏭️  Already exists: ${bot.name}`)
          phExisted++
        } else {
          throw error
        }
      }
    }

    console.log("")
    console.log("💬 Step 2: Creating virtual engagement bot users...")

    // 第二步：创建虚拟互动机器人
    for (const bot of ENGAGEMENT_BOTS) {
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
        console.log(`  ✅ Created: ${bot.name} (${bot.email})`)
        engagementCreated++
      } catch (error) {
        if (error instanceof Error && error.message.includes("duplicate")) {
          console.log(`  ⏭️  Already exists: ${bot.name}`)
          engagementExisted++
        } else {
          throw error
        }
      }
    }

    console.log("")
    console.log("🎉 Bot users restoration and regeneration completed!")
    console.log("")
    console.log("📊 Summary:")
    console.log(`  ProductHunt Bots: ${phCreated} created, ${phExisted} already existed`)
    console.log(
      `  Engagement Bots: ${engagementCreated} created, ${engagementExisted} already existed`,
    )
    console.log(
      `  Total: ${phCreated + engagementCreated} created, ${phExisted + engagementExisted} already existed`,
    )
    console.log("")

    process.exit(0)
  } catch (error) {
    console.error("❌ Operation failed:", error)
    process.exit(1)
  }
}

restoreAndRegenerateBots()
