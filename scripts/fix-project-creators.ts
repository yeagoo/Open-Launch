/**
 * 修复脚本：将历史项目的无效创建者关联到80个虚拟账号上
 *
 * 此脚本会：
 * 1. 查找所有创建者不存在的项目
 * 2. 将它们轮询分配给80个虚拟账号
 *
 * 运行方式: npx tsx scripts/fix-project-creators.ts
 */

import { db } from "@/drizzle/db"
import { project, user } from "@/drizzle/db/schema"
import { eq, notInArray, sql } from "drizzle-orm"

async function fixProjectCreators() {
  console.log("🔧 Starting project creators fix...")
  console.log("")

  try {
    // 1. 获取所有虚拟账号
    const botUsers = await db.select().from(user).where(eq(user.isBot, true))

    if (botUsers.length === 0) {
      console.error("❌ No bot users found in database")
      console.error("💡 Please run: npx tsx scripts/seed-bot-users.ts")
      process.exit(1)
    }

    console.log(`✅ Found ${botUsers.length} bot users`)
    console.log("")

    // 2. 获取所有有效的用户 ID
    const validUserIds = await db.select({ id: user.id }).from(user)
    const validIds = validUserIds.map((u) => u.id)

    // 3. 查找所有创建者不存在的项目
    const orphanProjects = await db
      .select()
      .from(project)
      .where(notInArray(project.createdBy, validIds))

    if (orphanProjects.length === 0) {
      console.log("✅ No orphan projects found. All projects have valid creators.")
      console.log("")
      process.exit(0)
    }

    console.log(`⚠️  Found ${orphanProjects.length} projects with invalid creators`)
    console.log("")

    // 4. 显示受影响的项目
    console.log("📋 Projects to be fixed:")
    orphanProjects.slice(0, 10).forEach((p) => {
      console.log(`  - ${p.name} (${p.id}) - old creator: ${p.createdBy}`)
    })
    if (orphanProjects.length > 10) {
      console.log(`  ... and ${orphanProjects.length - 10} more`)
    }
    console.log("")

    // 5. 轮询分配给虚拟账号
    console.log("🔄 Reassigning projects to bot users...")
    let fixed = 0

    for (let i = 0; i < orphanProjects.length; i++) {
      const p = orphanProjects[i]
      const botUser = botUsers[i % botUsers.length]

      await db
        .update(project)
        .set({
          createdBy: botUser.id,
          updatedAt: new Date(),
        })
        .where(eq(project.id, p.id))

      console.log(`  ✅ Fixed: ${p.name} → ${botUser.name} (${botUser.email})`)
      fixed++
    }

    console.log("")
    console.log("🎉 Project creators fix completed!")
    console.log("")
    console.log("📊 Summary:")
    console.log(`  Total bot users: ${botUsers.length}`)
    console.log(`  Projects fixed: ${fixed}`)
    console.log(`  Distribution: Each bot user got ~${Math.ceil(fixed / botUsers.length)} projects`)
    console.log("")

    // 6. 验证结果
    console.log("🔍 Verifying fix...")
    const remainingOrphans = await db
      .select()
      .from(project)
      .where(notInArray(project.createdBy, validIds))

    if (remainingOrphans.length === 0) {
      console.log("✅ All projects now have valid creators!")
    } else {
      console.log(`⚠️  Warning: ${remainingOrphans.length} projects still have invalid creators`)
    }

    console.log("")
    process.exit(0)
  } catch (error) {
    console.error("❌ Fix failed:", error)
    process.exit(1)
  }
}

fixProjectCreators()
