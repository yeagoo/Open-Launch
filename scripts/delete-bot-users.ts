/**
 * 删除脚本：删除所有 bot 用户
 * 运行方式: npx tsx scripts/delete-bot-users.ts
 */

import { db } from "@/drizzle/db"
import { user } from "@/drizzle/db/schema"
import { eq } from "drizzle-orm"

async function deleteBotUsers() {
  console.log("🗑️  Starting bot users deletion...")

  try {
    const result = await db.delete(user).where(eq(user.isBot, true))

    console.log("✅ All bot users deleted successfully!")
    console.log(`📊 Deleted users count: ${result.rowCount || "unknown"}`)
    process.exit(0)
  } catch (error) {
    console.error("❌ Deletion failed:", error)
    process.exit(1)
  }
}

deleteBotUsers()
