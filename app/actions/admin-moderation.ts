"use server"

import { headers } from "next/headers"

import { db } from "@/drizzle/db"
import { commentReport, fumaComments } from "@/drizzle/db/schema"
import { and, eq, isNull } from "drizzle-orm"

import { logAdminAction } from "@/lib/admin-audit"
import { auth } from "@/lib/auth"

async function checkAdminAccess(): Promise<{ adminId: string }> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.role || session.user.role !== "admin") {
    throw new Error("Unauthorized: Admin access required")
  }
  return { adminId: session.user.id }
}

export interface CommentReportRow {
  id: string
  commentId: number
  reason: string
  details: string | null
  contentSnapshot: unknown
  reporterId: string
  createdAt: Date
  commentHiddenAt: Date | null
  reportCount: number
}

/** Pending reports, oldest first, with a per-comment report count. */
export async function listPendingCommentReports(): Promise<CommentReportRow[]> {
  await checkAdminAccess()
  const rows = await db
    .select({
      id: commentReport.id,
      commentId: commentReport.commentId,
      reason: commentReport.reason,
      details: commentReport.details,
      contentSnapshot: commentReport.contentSnapshot,
      reporterId: commentReport.reporterId,
      createdAt: commentReport.createdAt,
      commentHiddenAt: fumaComments.hiddenAt,
    })
    .from(commentReport)
    .innerJoin(fumaComments, eq(fumaComments.id, commentReport.commentId))
    .where(eq(commentReport.status, "pending"))
    .orderBy(commentReport.createdAt)
    .limit(200)

  const counts = new Map<number, number>()
  for (const row of rows) counts.set(row.commentId, (counts.get(row.commentId) ?? 0) + 1)
  return rows.map((row) => ({ ...row, reportCount: counts.get(row.commentId) ?? 1 }))
}

// Tombstone content that replaces a hidden comment's body. Plain-text
// Tiptap doc — rendered by the same ContentRenderer as normal comments.
const TOMBSTONE_CONTENT = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "[removed by moderator]" }] }],
}

/**
 * Hide a reported comment (tombstone: content replaced, thread structure
 * preserved) and mark all its pending reports actioned. The update is
 * guarded on hidden_at IS NULL so a second admin click is a no-op and a
 * hidden comment can never be re-tombstoned with a different body.
 */
export async function hideReportedComment(reportId: string): Promise<void> {
  const { adminId } = await checkAdminAccess()

  const [report] = await db
    .select({ id: commentReport.id, commentId: commentReport.commentId })
    .from(commentReport)
    .where(and(eq(commentReport.id, reportId), eq(commentReport.status, "pending")))
    .limit(1)
  if (!report) throw new Error("Report not found or already resolved")

  await db.transaction(async (tx) => {
    const updated = await tx
      .update(fumaComments)
      .set({ content: TOMBSTONE_CONTENT, hiddenAt: new Date(), hiddenBy: adminId })
      .where(and(eq(fumaComments.id, report.commentId), isNull(fumaComments.hiddenAt)))
    if (!updated.rowCount) throw new Error("Comment is already hidden")

    await tx
      .update(commentReport)
      .set({ status: "actioned", resolvedBy: adminId, resolvedAt: new Date() })
      .where(
        and(eq(commentReport.commentId, report.commentId), eq(commentReport.status, "pending")),
      )
  })

  await logAdminAction({
    adminUserId: adminId,
    action: "comment.hide",
    targetType: "comment",
    targetId: String(report.commentId),
  }).catch((err) => console.error("audit log failed:", err))
}

/**
 * Hard-delete a reported comment. Prefer hideReportedComment when the
 * comment has replies (deleting detaches them); delete is for clear spam.
 */
export async function deleteReportedComment(reportId: string): Promise<void> {
  const { adminId } = await checkAdminAccess()

  const [report] = await db
    .select({ id: commentReport.id, commentId: commentReport.commentId })
    .from(commentReport)
    .where(and(eq(commentReport.id, reportId), eq(commentReport.status, "pending")))
    .limit(1)
  if (!report) throw new Error("Report not found or already resolved")

  await db.transaction(async (tx) => {
    await tx.delete(fumaComments).where(eq(fumaComments.id, report.commentId))
    // The comment FK cascades the report rows themselves, so there is
    // nothing to mark actioned.
  })

  await logAdminAction({
    adminUserId: adminId,
    action: "comment.delete",
    targetType: "comment",
    targetId: String(report.commentId),
  }).catch((err) => console.error("audit log failed:", err))
}

/** Dismiss a report (comment stays). */
export async function dismissCommentReport(reportId: string): Promise<void> {
  const { adminId } = await checkAdminAccess()

  const updated = await db
    .update(commentReport)
    .set({ status: "dismissed", resolvedBy: adminId, resolvedAt: new Date() })
    .where(and(eq(commentReport.id, reportId), eq(commentReport.status, "pending")))
  if (!updated.rowCount) throw new Error("Report not found or already resolved")

  await logAdminAction({
    adminUserId: adminId,
    action: "comment_report.dismiss",
    targetType: "comment_report",
    targetId: reportId,
  }).catch((err) => console.error("audit log failed:", err))
}
