import { revalidatePath } from "next/cache"
import { NextRequest, NextResponse } from "next/server"

import { db } from "@/drizzle/db"
import { tag, tagModerationStatus } from "@/drizzle/db/schema"
import { eq } from "drizzle-orm"

import { moderateTags } from "@/lib/ai-content"

const API_KEY = process.env.CRON_API_KEY

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization")
    const providedKey = authHeader?.replace("Bearer ", "")

    if (!API_KEY || providedKey !== API_KEY) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Fetch all tags with PENDING status (awaiting moderation)
    const recentTags = await db
      .select()
      .from(tag)
      .where(eq(tag.moderationStatus, tagModerationStatus.PENDING))

    if (recentTags.length === 0) {
      return NextResponse.json({
        message: "No new tags to moderate",
        deleted: 0,
        flagged: 0,
        approved: 0,
      })
    }

    // Batch moderation via DeepSeek
    const tagNames = recentTags.map((t) => t.name)
    const results = await moderateTags(tagNames)

    let deleted = 0
    let flagged = 0
    let approved = 0

    for (let i = 0; i < recentTags.length; i++) {
      const { verdict, reason } = results[i]

      if (verdict === "deleted") {
        await db.delete(tag).where(eq(tag.id, recentTags[i].id))
        deleted++
      } else if (verdict === "flagged") {
        await db
          .update(tag)
          .set({
            moderationStatus: tagModerationStatus.FLAGGED,
            moderationNote: reason || "Flagged by AI moderation",
            updatedAt: new Date(),
          })
          .where(eq(tag.id, recentTags[i].id))
        flagged++
      } else {
        await db
          .update(tag)
          .set({
            moderationStatus: tagModerationStatus.APPROVED,
            updatedAt: new Date(),
          })
          .where(eq(tag.id, recentTags[i].id))
        approved++
      }
    }

    revalidatePath("/tags")

    return NextResponse.json({
      message: "Tag moderation complete",
      total: recentTags.length,
      deleted,
      flagged,
      approved,
    })
  } catch (error) {
    console.error("Error in tag moderation cron:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
