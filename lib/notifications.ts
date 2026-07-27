/**
 * In-app notification producers.
 *
 * Design rules:
 *  - Notifications are BEST-EFFORT: `createNotification` never throws into
 *    the caller's request path (a broken notification must not fail a
 *    comment post, a vote, or a cron).
 *  - Producers are idempotent via `dedupeKey` (UNIQUE, ON CONFLICT DO
 *    NOTHING) — milestones can race concurrent votes, and launch-status
 *    transitions can be replayed by a cron retry.
 *  - Bot activity never notifies: bot commenters/voters are filtered via
 *    the authoritative `user.isBot` flag.
 */

import { db } from "@/drizzle/db"
import { notification, project, user } from "@/drizzle/db/schema"
import { eq, sql } from "drizzle-orm"

export type NotificationType =
  "comment" | "reply" | "mention" | "upvote_milestone" | "launch_status"

interface CreateNotificationInput {
  userId: string
  type: NotificationType
  actorId?: string | null
  projectId?: string | null
  commentId?: number | null
  metadata?: Record<string, unknown>
  dedupeKey?: string
}

export async function createNotification(input: CreateNotificationInput): Promise<void> {
  try {
    await db
      .insert(notification)
      .values({
        userId: input.userId,
        type: input.type,
        actorId: input.actorId ?? null,
        projectId: input.projectId ?? null,
        commentId: input.commentId ?? null,
        metadata: input.metadata ?? null,
        dedupeKey: input.dedupeKey ?? null,
      })
      .onConflictDoNothing({ target: notification.dedupeKey })
  } catch (err) {
    console.error("[notifications] failed to create notification:", err)
  }
}

/** True when the given user id belongs to a bot account. */
async function isBotUser(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ isBot: user.isBot })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1)
  return row?.isBot ?? false
}

/**
 * New top-level comment on a project → notify the project owner.
 * Skips: own comments, bot commenters, bot/absent owners.
 */
export async function notifyNewComment(
  projectId: string,
  commentAuthorId: string,
  excerpt: string,
  commentId: number | null = null,
): Promise<void> {
  try {
    const [proj] = await db
      .select({ createdBy: project.createdBy })
      .from(project)
      .where(eq(project.id, projectId))
      .limit(1)
    if (!proj?.createdBy || proj.createdBy === commentAuthorId) return
    // ProductHunt-imported projects are owned by bot accounts — notifying
    // them just accumulates unread rows nobody will ever see.
    if (await isBotUser(proj.createdBy)) return
    if (await isBotUser(commentAuthorId)) return

    await createNotification({
      userId: proj.createdBy,
      type: "comment",
      actorId: commentAuthorId,
      projectId,
      commentId,
      metadata: { excerpt: excerpt.slice(0, 140) },
    })
  } catch (err) {
    console.error("[notifications] notifyNewComment failed:", err)
  }
}

/**
 * Reply to a comment → notify the parent comment's author.
 * Skips: self-replies, bot commenters, missing parents.
 */
export async function notifyReply(
  parentCommentId: number,
  replyAuthorId: string,
  projectId: string,
  excerpt: string,
  replyCommentId: number | null = null,
): Promise<void> {
  try {
    // The parent must belong to the SAME project (fuma stores body.thread
    // unverified): a crafted reply on project A citing a thread id from
    // project B would otherwise mis-notify B's comment author.
    const [parent] = await db
      .execute<{ author: string }>(
        sql`
      SELECT author FROM fuma_comments WHERE id = ${parentCommentId} AND page = ${projectId} LIMIT 1
    `,
      )
      .then((r) => r.rows)
    if (!parent || parent.author === replyAuthorId) return
    if (parent.author === "deleted-user" || parent.author.startsWith("bot-user-")) return
    if (await isBotUser(replyAuthorId)) return

    await createNotification({
      userId: parent.author,
      type: "reply",
      actorId: replyAuthorId,
      projectId,
      // The REPLY's own id: moderation cleanup deletes notifications by
      // the moderated comment's id. The parent id moves to metadata.
      commentId: replyCommentId,
      metadata: { excerpt: excerpt.slice(0, 140), parentCommentId },
    })
  } catch (err) {
    console.error("[notifications] notifyReply failed:", err)
  }
}

/** @-mention in a comment → notify each mentioned user (except the author). */
export async function notifyMentions(
  mentionedUserIds: string[],
  authorId: string,
  projectId: string,
  excerpt: string,
  commentId: number | null = null,
): Promise<void> {
  try {
    const unique = [...new Set(mentionedUserIds)].filter((id) => id && id !== authorId)
    for (const userId of unique) {
      await createNotification({
        userId,
        type: "mention",
        actorId: authorId,
        projectId,
        commentId,
        metadata: { excerpt: excerpt.slice(0, 140) },
        // One mention notification per comment per user. Keyed by the
        // comment id when available — an excerpt-prefix key could collapse
        // two DIFFERENT comments that happen to start with the same text.
        dedupeKey: commentId
          ? `mention:${commentId}:${userId}`
          : `mention:${projectId}:${authorId}:${userId}:${excerpt.slice(0, 32)}`,
      })
    }
  } catch (err) {
    console.error("[notifications] notifyMentions failed:", err)
  }
}

const MILESTONES = [10, 50, 100, 500] as const

/**
 * Vote milestones on a project → notify the owner. Concurrent votes can
 * jump PAST a threshold (9 → 11), so we can't match exact counts: insert
 * every milestone at or below the current count and let the per-milestone
 * dedupe key collapse whatever was already notified. This makes
 * notifications both duplicate-proof AND skip-proof.
 */
export async function notifyUpvoteMilestone(
  projectId: string,
  currentCount: number,
): Promise<void> {
  try {
    const crossed = MILESTONES.filter((m) => currentCount >= m)
    if (crossed.length === 0) return

    const [proj] = await db
      .select({ createdBy: project.createdBy })
      .from(project)
      .where(eq(project.id, projectId))
      .limit(1)
    if (!proj?.createdBy || (await isBotUser(proj.createdBy))) return

    for (const milestone of crossed) {
      await createNotification({
        userId: proj.createdBy,
        type: "upvote_milestone",
        projectId,
        metadata: { milestone },
        dedupeKey: `milestone:${milestone}:${projectId}`,
      })
    }
  } catch (err) {
    console.error("[notifications] notifyUpvoteMilestone failed:", err)
  }
}

/** Launch status transition (e.g. scheduled → ongoing) → notify the owner. */
export async function notifyLaunchStatus(
  projectId: string,
  ownerId: string,
  newStatus: string,
): Promise<void> {
  try {
    // Bot-owned (ProductHunt-imported) projects never read notifications.
    if (await isBotUser(ownerId)) return
    await createNotification({
      userId: ownerId,
      type: "launch_status",
      projectId,
      metadata: { newStatus },
      dedupeKey: `status:${newStatus}:${projectId}`,
    })
  } catch (err) {
    // Best-effort like every other producer: callers fire-and-forget this
    // from the launch cron, so a transient DB error must not reject there.
    console.error("[notifications] notifyLaunchStatus failed:", err)
  }
}
