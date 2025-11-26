/**
 * 种子脚本：创建虚拟用户用于评论和点赞
 * 运行方式: npx tsx scripts/seed-bot-users.ts
 */

import { db } from "@/drizzle/db"
import { user } from "@/drizzle/db/schema"

// 生成80个机器人用户 - 使用真实的国际化姓名
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

// 姓氏库（80个） - 包含欧美、拉美和亚洲姓氏
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

// 生成80个bot用户 - 使用质数偏移确保姓名组合多样化
const BOT_USERS = Array.from({ length: 80 }, (_, i) => {
  const num = i + 1

  // 使用质数偏移避免重复模式
  const firstNameIndex = i % FIRST_NAMES.length
  const lastNameIndex = (i * 7 + 13) % LAST_NAMES.length // 7和13是质数
  const roleIndex = i % ROLES.length

  const firstName = FIRST_NAMES[firstNameIndex]
  const lastName = LAST_NAMES[lastNameIndex]
  const role = ROLES[roleIndex]

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
