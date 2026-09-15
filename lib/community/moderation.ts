import "server-only"

import {
  communityModerationEvent as audit,
  communityReply as reply,
  communityReport as report,
  communityThread as thread,
} from "@/drizzle/db/schema"
import { asc, eq, sql } from "drizzle-orm"

import { CommunityError, type ModerationAction } from "./contracts"
import { lockThread } from "./server-context"
import type {
  CommunityActor,
  CommunityReplyModerationOutcome,
  CommunityTransaction,
} from "./server-types"

type PostModerationChange =
  { moderation: "hidden" | "public" } | { lockedAt: Date | null } | { pinnedUntil: Date | null }

/**
 * Moderation controls express desired state rather than one-time toggles. A
 * lost response can make a moderator retry the same Server Action, so do not
 * create a second audit event or version conflict once that state is reached.
 */
function desiredPostModerationChange(
  post: typeof thread.$inferSelect,
  action: ModerationAction,
  now: Date,
): PostModerationChange | null {
  switch (action) {
    case "hide":
      return post.moderation === "hidden" ? null : { moderation: "hidden" }
    case "restore":
      return post.moderation === "public" ? null : { moderation: "public" }
    case "lock":
      return post.lockedAt ? null : { lockedAt: now }
    case "unlock":
      return post.lockedAt ? { lockedAt: null } : null
    case "pin":
      return post.pinnedUntil && post.pinnedUntil > now
        ? null
        : { pinnedUntil: new Date(now.getTime() + 7 * 86400000) }
    case "unpin":
      return post.pinnedUntil && post.pinnedUntil > now ? { pinnedUntil: null } : null
  }
}

export async function submitReport(
  tx: CommunityTransaction,
  actor: CommunityActor,
  id: string,
  reason: string,
  isReply = false,
) {
  let threadId = id
  if (isReply) {
    const [pointer] = await tx
      .select({ threadId: reply.threadId })
      .from(reply)
      .where(eq(reply.id, id))
    if (!pointer) throw new CommunityError("missing", "Reply not found")
    threadId = pointer.threadId
  }
  const post = await lockThread(tx, threadId)
  if (post.lifecycle !== "published" || post.moderation !== "public")
    throw new CommunityError("missing", "Post unavailable")
  let body = post.body,
    authorId = post.authorId
  if (isReply) {
    const [row] = await tx.select().from(reply).where(eq(reply.id, id)).for("share")
    if (!row || row.deletedAt || row.moderation !== "public")
      throw new CommunityError("missing", "Reply unavailable")
    body = row.body
    authorId = row.authorId
  }
  if (authorId === actor.id)
    throw new CommunityError("validation", "You cannot report your own content")
  await tx
    .insert(report)
    .values({
      reporterId: actor.id,
      ...(isReply ? { replyId: id } : { threadId: id }),
      reason: reason.trim(),
      contentSnapshot: body,
    })
    .onConflictDoNothing()
}
export async function reportsPage(tx: CommunityTransaction) {
  // Phase 1 interface is an array; bounded pending queue. A resolved audit remains in the DB.
  return tx
    .select({
      id: report.id,
      postId: sql<string>`coalesce(${report.threadId},${reply.threadId})`,
      replyId: report.replyId,
      reason: report.reason,
      snapshot: report.contentSnapshot,
      resolved: sql<boolean>`${report.status}='resolved'`,
    })
    .from(report)
    .leftJoin(reply, eq(report.replyId, reply.id))
    .where(eq(report.status, "pending"))
    .orderBy(asc(report.createdAt), asc(report.id))
    .limit(50)
}
export async function moderatePost(
  tx: CommunityTransaction,
  actor: CommunityActor,
  id: string,
  action: ModerationAction,
  reason: string,
): Promise<boolean> {
  const post = await lockThread(tx, id)
  if (post.lifecycle !== "published")
    throw new CommunityError(
      "conflict",
      "Deleted posts and private drafts cannot be moderated into public posts",
    )
  const now = new Date()
  const change = desiredPostModerationChange(post, action, now)
  if (!change) return false
  await tx
    .update(thread)
    .set({
      ...change,
      version: post.version + 1,
      updatedAt: now,
    })
    .where(eq(thread.id, id))
  await tx.insert(audit).values({ actorId: actor.id, threadId: id, action, reason })
  return true
}
export async function moderateReply(
  tx: CommunityTransaction,
  actor: CommunityActor,
  id: string,
  action: "hide" | "restore",
  reason: string,
): Promise<CommunityReplyModerationOutcome> {
  const [pointer] = await tx
    .select({ threadId: reply.threadId })
    .from(reply)
    .where(eq(reply.id, id))
  if (!pointer) throw new CommunityError("missing", "Reply not found")
  await lockThread(tx, pointer.threadId)
  const [row] = await tx.select().from(reply).where(eq(reply.id, id)).for("update")
  if (!row || row.deletedAt)
    throw new CommunityError("conflict", "Deleted replies cannot be restored")
  const desiredModeration = action === "hide" ? "hidden" : "public"
  if (row.moderation === desiredModeration) return { threadId: pointer.threadId, changed: false }
  await tx
    .update(reply)
    .set({
      moderation: desiredModeration,
      version: row.version + 1,
      updatedAt: new Date(),
    })
    .where(eq(reply.id, id))
  await tx
    .insert(audit)
    .values({ actorId: actor.id, replyId: id, threadId: pointer.threadId, action, reason })
  return { threadId: pointer.threadId, changed: true }
}
export async function resolveReport(tx: CommunityTransaction, actor: CommunityActor, id: string) {
  const [row] = await tx.select().from(report).where(eq(report.id, id)).for("update")
  if (!row) throw new CommunityError("missing", "Report not found")
  if (row.status === "resolved") return
  await tx
    .update(report)
    .set({ status: "resolved", resolverId: actor.id, resolvedAt: new Date() })
    .where(eq(report.id, id))
  await tx.insert(audit).values({
    actorId: actor.id,
    threadId: row.threadId,
    replyId: row.replyId,
    action: "resolve_report",
    reason: row.reason,
  })
}
