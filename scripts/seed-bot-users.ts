/**
 * 种子脚本：创建虚拟用户用于评论和点赞
 * 运行方式: npx tsx scripts/seed-bot-users.ts
 */

import { db } from "@/drizzle/db"
import { user } from "@/drizzle/db/schema"

// 生成80个机器人用户
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
  "Chen",
  "Smith",
  "Kumar",
  "Lee",
  "Garcia",
  "Wang",
  "Rodriguez",
  "Kim",
  "Patel",
  "Brown",
  "Johnson",
  "Miller",
  "Davis",
  "Wilson",
  "Anderson",
  "Taylor",
  "Martinez",
  "Thomas",
  "Moore",
  "Jackson",
  "White",
  "Harris",
  "Martin",
  "Thompson",
  "Martinez",
  "Robinson",
  "Clark",
  "Lewis",
  "Walker",
  "Hall",
  "Allen",
  "Young",
  "King",
  "Wright",
  "Lopez",
  "Hill",
  "Scott",
  "Green",
  "Adams",
  "Baker",
  "Nelson",
  "Carter",
  "Mitchell",
  "Perez",
  "Roberts",
  "Turner",
  "Phillips",
  "Campbell",
  "Parker",
  "Evans",
  "Edwards",
  "Collins",
  "Stewart",
  "Sanchez",
  "Morris",
  "Rogers",
  "Reed",
  "Cook",
  "Morgan",
  "Bell",
  "Murphy",
  "Bailey",
  "Rivera",
  "Cooper",
  "Richardson",
  "Cox",
  "Howard",
  "Ward",
  "Torres",
  "Peterson",
  "Gray",
  "Ramirez",
  "James",
  "Watson",
  "Brooks",
  "Kelly",
  "Sanders",
  "Price",
  "Bennett",
  "Wood",
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

// 生成80个bot用户
const BOT_USERS = Array.from({ length: 80 }, (_, i) => {
  const num = i + 1
  const firstName = FIRST_NAMES[i % FIRST_NAMES.length]
  const lastName = LAST_NAMES[Math.floor(i / FIRST_NAMES.length) % LAST_NAMES.length]
  const role = ROLES[i % ROLES.length]

  return {
    id: `bot-user-${num}`,
    name: `${firstName} ${lastName}`,
    email: `bot${num}@aat.ee`,
    role: role,
  }
})

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
