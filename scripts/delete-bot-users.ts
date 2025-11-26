/**
 * 删除脚本：删除虚拟互动的 bot 用户（engagement-bot-1 到 engagement-bot-80）
 * 保留 ProductHunt 自动发布使用的账号（ph-bot-1 到 ph-bot-5）
 *
 * ⚠️  此脚本已废弃，请使用 restore-and-regenerate-bots.ts
 *
 * 运行方式: npx tsx scripts/delete-bot-users.ts
 */

import { db } from "@/drizzle/db"
import { user } from "@/drizzle/db/schema"
import { and, eq, like } from "drizzle-orm"

async function deleteBotUsers() {
  console.log("⚠️  WARNING: This script is deprecated!")
  console.log("⚠️  Please use: npx tsx scripts/restore-and-regenerate-bots.ts")
  console.log("")
  console.log("🗑️  Starting bot users deletion...")
  console.log("ℹ️  This will delete engagement-bot-* users")
  console.log("ℹ️  ProductHunt bot users (ph-bot-*) will be preserved")

  try {
    // 只删除 id 以 engagement-bot- 开头的用户
    // 保留 ProductHunt 使用的 ph-bot-* 用户
    const result = await db
      .delete(user)
      .where(and(eq(user.isBot, true), like(user.id, "engagement-bot-%")))

    console.log("✅ Virtual engagement bot users deleted successfully!")
    console.log(`📊 Deleted users count: ${result.rowCount || "unknown"}`)
    console.log("✅ ProductHunt bot users preserved")
    console.log("")
    console.log("💡 Tip: Run 'npx tsx scripts/restore-and-regenerate-bots.ts' to regenerate")
    process.exit(0)
  } catch (error) {
    console.error("❌ Deletion failed:", error)
    process.exit(1)
  }
}

deleteBotUsers()
