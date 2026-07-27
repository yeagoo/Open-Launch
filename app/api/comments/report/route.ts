import { NextRequest, NextResponse } from "next/server"

import { db } from "@/drizzle/db"
import { commentReport, fumaComments } from "@/drizzle/db/schema"
import { eq } from "drizzle-orm"
import * as z from "zod"

import { commentAuth } from "@/lib/comment.config"
import { checkRateLimit } from "@/lib/rate-limit"

export const dynamic = "force-dynamic"

const REASONS = ["spam", "abuse", "offtopic", "other"] as const

const bodySchema = z.object({
  commentId: z.number().int().positive(),
  reason: z.enum(REASONS),
  details: z.string().max(500).optional(),
})

/**
 * Report a comment for admin review. Session-gated, rate limited
 * (fail-closed), one report per (comment, reporter) — the unique index
 * makes duplicates a silent no-op.
 */
export async function POST(request: NextRequest) {
  const session = await commentAuth.getSession(request as never)
  if (!session) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 })
  }

  // Reports are a write path with moderation consequences — fail closed
  // so a limiter outage can't multiply the budget across instances.
  const { success } = await checkRateLimit(`comment-report:${session.id}`, 10, 60 * 60 * 1000, {
    onRedisError: "fail-closed",
  })
  if (!success) {
    return NextResponse.json(
      { error: "Too many reports. Please try again later." },
      { status: 429 },
    )
  }

  let body: z.infer<typeof bodySchema>
  try {
    body = bodySchema.parse(await request.json())
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  // The comment must exist (and we snapshot its content so the admin
  // queue can review even if the author edits or it's tombstoned later).
  const [comment] = await db
    .select({
      id: fumaComments.id,
      author: fumaComments.author,
      content: fumaComments.content,
      hiddenAt: fumaComments.hiddenAt,
    })
    .from(fumaComments)
    .where(eq(fumaComments.id, body.commentId))
    .limit(1)
  if (!comment) {
    return NextResponse.json({ error: "Comment not found" }, { status: 404 })
  }
  // Already hidden by a moderator — a pending report for it could never
  // be actioned (hideReportedComment guards on hidden_at IS NULL).
  if (comment.hiddenAt) {
    return NextResponse.json({ error: "Comment already moderated" }, { status: 409 })
  }
  // Self-reports pollute the moderation queue (the UI hides the button,
  // but the endpoint is the real gate).
  if (comment.author === session.id) {
    return NextResponse.json({ error: "You cannot report your own comment" }, { status: 400 })
  }

  await db
    .insert(commentReport)
    .values({
      commentId: body.commentId,
      reporterId: session.id,
      reason: body.reason,
      details: body.details ?? null,
      contentSnapshot: comment.content,
    })
    .onConflictDoNothing({ target: [commentReport.commentId, commentReport.reporterId] })

  return NextResponse.json({ success: true })
}
