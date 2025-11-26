/**
 * 删除脚本：删除所有虚拟机器人用户
 *
 * ⚠️  这会删除所有 is_bot = true 的用户
 * ⚠️  包括用于 ProductHunt 自动发布和虚拟互动的账号
 *
 * 运行方式: npx tsx scripts/delete-bot-users.ts
 */

import { db } from "@/drizzle/db"
import { user } from "@/drizzle/db/schema"
import { eq } from "drizzle-orm"

async function deleteBotUsers() {
  console.log("🗑️  Starting bot users deletion...")
  console.log("⚠️  This will delete ALL bot users (is_bot = true)")
  console.log("")

  try {
    const result = await db.delete(user).where(eq(user.isBot, true))

    console.log("✅ All bot users deleted successfully!")
    console.log(`📊 Deleted users count: ${result.rowCount || "unknown"}`)
    console.log("")
    console.log("💡 Tip: Run 'npx tsx scripts/seed-bot-users.ts' to regenerate")
    process.exit(0)
  } catch (error) {
    console.error("❌ Deletion failed:", error)
    process.exit(1)
  }
}

deleteBotUsers()
