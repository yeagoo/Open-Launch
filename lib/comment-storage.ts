import "server-only"

import { db } from "@/drizzle/db"
import { fumaComments, fumaRates, fumaRoles, user } from "@/drizzle/db/schema"
import { RouteError, type Comment, type StorageAdapter } from "@fuma-comment/server"
import { createDrizzleAdapter } from "@fuma-comment/server/adapters/drizzle"
import { and, asc, count, desc, eq, gt, inArray, isNull, lt, sql } from "drizzle-orm"

import { COMMENT_WITH_REPLIES_THREAD } from "@/lib/comment-pagination"
import { countInt } from "@/lib/db-utils"

type GetCommentsOptions = Parameters<StorageAdapter["getComments"]>[0]
type PostCommentOptions = Parameters<StorageAdapter["postComment"]>[0]
type UpdateCommentOptions = Parameters<StorageAdapter["updateComment"]>[0]
type DeleteCommentOptions = Parameters<StorageAdapter["deleteComment"]>[0]
type SetRateOptions = Parameters<StorageAdapter["setRate"]>[0]
type DeleteRateOptions = Parameters<StorageAdapter["deleteRate"]>[0]
type CommentRow = typeof fumaComments.$inferSelect

const fallbackStorage = createDrizzleAdapter({
  db,
  auth: "better-auth",
  schemas: {
    comments: fumaComments,
    rates: fumaRates,
    roles: fumaRoles,
    user,
  },
})

function parseCommentId(value: string | undefined): number | undefined {
  if (!value || !/^\d+$/.test(value)) return undefined
  const id = Number(value)
  return Number.isSafeInteger(id) && id > 0 ? id : undefined
}

function validDate(value: Date | undefined): Date | undefined {
  return value && Number.isFinite(value.getTime()) ? value : undefined
}

function normalizeLimit(value: number): number {
  if (!Number.isFinite(value)) return 40
  return Math.max(1, Math.min(50, Math.floor(value)))
}

function routeError(statusCode: number, message: string): RouteError {
  return new RouteError({ statusCode, message })
}

async function getCommentAuthor(id: string): Promise<string | null> {
  const commentId = parseCommentId(id)
  if (!commentId) return null

  const [row] = await db
    .select({ author: fumaComments.author })
    .from(fumaComments)
    .where(eq(fumaComments.id, commentId))
    .limit(1)
  return row?.author ?? null
}

function toComment(
  row: CommentRow,
  profilesById: Map<string, Comment["author"]>,
  ratesByCommentId: Map<number, { likes: number; dislikes: number }>,
  repliesByCommentId: Map<number, number>,
  ownRatesByCommentId: Map<number, boolean>,
): Comment {
  return {
    id: String(row.id),
    author: profilesById.get(row.author) ?? { id: "unknown", name: "Deleted User" },
    content: row.content as Comment["content"],
    likes: ratesByCommentId.get(row.id)?.likes ?? 0,
    dislikes: ratesByCommentId.get(row.id)?.dislikes ?? 0,
    replies: repliesByCommentId.get(row.id) ?? 0,
    timestamp: row.timestamp,
    liked: ownRatesByCommentId.get(row.id),
    page: row.page,
    threadId: row.thread ? String(row.thread) : undefined,
  }
}

/**
 * Hydrate a bounded comment set with four batched queries. The upstream
 * Drizzle adapter joins likes and dislikes at once, which multiplies counts
 * when a comment has both, and then performs one reply-count query per row.
 */
async function hydrateComments(rows: CommentRow[], authId?: string): Promise<Comment[]> {
  if (rows.length === 0) return []

  const commentIds = rows.map((row) => row.id)
  const authorIds = [...new Set(rows.map((row) => row.author))]
  const [rateRows, replyRows, userRows, ownRateRows] = await Promise.all([
    db
      .select({
        commentId: fumaRates.commentId,
        likes: countInt(sql`${fumaRates.like}`),
        dislikes: countInt(sql`not ${fumaRates.like}`),
      })
      .from(fumaRates)
      .where(inArray(fumaRates.commentId, commentIds))
      .groupBy(fumaRates.commentId),
    db
      .select({ threadId: fumaComments.thread, replies: count() })
      .from(fumaComments)
      .where(inArray(fumaComments.thread, commentIds))
      .groupBy(fumaComments.thread),
    db
      .select({ id: user.id, name: user.name, image: user.image })
      .from(user)
      .where(inArray(user.id, authorIds)),
    authId
      ? db
          .select({ commentId: fumaRates.commentId, like: fumaRates.like })
          .from(fumaRates)
          .where(and(eq(fumaRates.userId, authId), inArray(fumaRates.commentId, commentIds)))
      : Promise.resolve([] as Array<{ commentId: number; like: boolean }>),
  ])

  const ratesByCommentId = new Map(
    rateRows.map((row) => [row.commentId, { likes: row.likes, dislikes: row.dislikes }]),
  )
  const repliesByCommentId = new Map(
    replyRows.flatMap((row) =>
      row.threadId === null ? [] : [[row.threadId, Number(row.replies)] as const],
    ),
  )
  const profilesById = new Map(
    userRows.map((row) => [
      row.id,
      {
        id: row.id,
        name: row.name || "Unknown User",
        image: row.image ?? undefined,
      },
    ]),
  )
  const ownRatesByCommentId = new Map(ownRateRows.map((row) => [row.commentId, row.like]))

  return rows.map((row) =>
    toComment(row, profilesById, ratesByCommentId, repliesByCommentId, ownRatesByCommentId),
  )
}

async function getComments({
  auth,
  sort,
  page,
  after,
  thread,
  before,
  limit,
}: GetCommentsOptions): Promise<Comment[]> {
  // The route always supplies a page. Returning no data if a future caller
  // omits it avoids accidentally exposing every comment in the installation.
  if (!page) return []

  const includeReplies = thread === COMMENT_WITH_REPLIES_THREAD
  const threadId = includeReplies || !thread ? undefined : parseCommentId(thread)
  if (thread && !includeReplies && !threadId) return []

  const beforeDate = validDate(before)
  const afterDate = validDate(after)
  const orderBy =
    sort === "newest"
      ? [desc(fumaComments.timestamp), desc(fumaComments.id)]
      : [asc(fumaComments.timestamp), asc(fumaComments.id)]
  const comments = await db
    .select()
    .from(fumaComments)
    .where(
      and(
        eq(fumaComments.page, page),
        threadId ? eq(fumaComments.thread, threadId) : isNull(fumaComments.thread),
        beforeDate ? lt(fumaComments.timestamp, beforeDate) : undefined,
        afterDate ? gt(fumaComments.timestamp, afterDate) : undefined,
      ),
    )
    .orderBy(...orderBy)
    .limit(normalizeLimit(limit))

  if (!includeReplies || comments.length === 0) {
    return hydrateComments(comments, auth?.id)
  }

  // Replies are direct children only. New writes enforce the same shape, so a
  // response can safely be grouped in the client without recursive queries.
  const replies = await db
    .select()
    .from(fumaComments)
    .where(
      and(
        eq(fumaComments.page, page),
        inArray(
          fumaComments.thread,
          comments.map((comment) => comment.id),
        ),
      ),
    )
    .orderBy(asc(fumaComments.timestamp), asc(fumaComments.id))

  return hydrateComments([...comments, ...replies], auth?.id)
}

async function postComment({ auth, body, page }: PostCommentOptions): Promise<Comment> {
  const hasThread = body.thread !== undefined && body.thread !== null && body.thread !== ""
  const threadId = hasThread ? parseCommentId(body.thread) : undefined
  if (hasThread && !threadId) {
    throw routeError(400, "Invalid parent comment.")
  }

  let created: CommentRow
  if (threadId) {
    created = await db.transaction(async (tx) => {
      // Locking the parent makes the hidden-state check and insertion one
      // atomic operation relative to moderator tombstoning.
      const [parent] = await tx
        .select({
          id: fumaComments.id,
          hiddenAt: fumaComments.hiddenAt,
          thread: fumaComments.thread,
        })
        .from(fumaComments)
        .where(and(eq(fumaComments.id, threadId), eq(fumaComments.page, page)))
        .for("update")
        .limit(1)
      if (!parent) throw routeError(404, "Parent comment not found.")
      if (parent.hiddenAt) throw routeError(403, "This comment has been removed by a moderator.")
      if (parent.thread !== null) throw routeError(400, "Replies must target a top-level comment.")

      const [row] = await tx
        .insert(fumaComments)
        .values({ author: auth.id, content: body.content, page, thread: threadId })
        .returning()
      if (!row) throw new Error("Failed to create comment")
      return row
    })
  } else {
    const [row] = await db
      .insert(fumaComments)
      .values({ author: auth.id, content: body.content, page })
      .returning()
    if (!row) throw new Error("Failed to create comment")
    created = row
  }

  const [author] = await db
    .select({ id: user.id, name: user.name, image: user.image })
    .from(user)
    .where(eq(user.id, created.author))
    .limit(1)
  return {
    id: String(created.id),
    author: author
      ? { id: author.id, name: author.name || "Unknown User", image: author.image ?? undefined }
      : { id: "unknown", name: "Deleted User" },
    content: created.content as Comment["content"],
    likes: 0,
    dislikes: 0,
    replies: 0,
    timestamp: created.timestamp,
    page: created.page,
    threadId: created.thread ? String(created.thread) : undefined,
  }
}

async function updateComment({ id, page, auth, body }: UpdateCommentOptions): Promise<void> {
  const commentId = parseCommentId(id)
  if (!commentId) throw routeError(404, "Comment not found.")

  const updated = await db
    .update(fumaComments)
    .set({ content: body.content })
    .where(
      and(
        eq(fumaComments.id, commentId),
        eq(fumaComments.page, page),
        eq(fumaComments.author, auth.id),
        isNull(fumaComments.hiddenAt),
      ),
    )
    .returning({ id: fumaComments.id })
  if (updated.length > 0) return

  const [comment] = await db
    .select({ hiddenAt: fumaComments.hiddenAt })
    .from(fumaComments)
    .where(and(eq(fumaComments.id, commentId), eq(fumaComments.page, page)))
    .limit(1)
  if (comment?.hiddenAt) throw routeError(403, "This comment has been removed by a moderator.")
  throw routeError(404, "Comment not found.")
}

async function deleteComment({ id, page }: DeleteCommentOptions): Promise<void> {
  const commentId = parseCommentId(id)
  if (!commentId) throw routeError(404, "Comment not found.")

  const deleted = await db
    .delete(fumaComments)
    .where(
      and(
        eq(fumaComments.id, commentId),
        eq(fumaComments.page, page),
        isNull(fumaComments.hiddenAt),
      ),
    )
    .returning({ id: fumaComments.id })
  if (deleted.length > 0) return

  const [comment] = await db
    .select({ hiddenAt: fumaComments.hiddenAt })
    .from(fumaComments)
    .where(and(eq(fumaComments.id, commentId), eq(fumaComments.page, page)))
    .limit(1)
  if (comment?.hiddenAt) throw routeError(403, "This comment has been removed by a moderator.")
}

async function setRate({ id, page, auth, body }: SetRateOptions): Promise<void> {
  const commentId = parseCommentId(id)
  if (!commentId) throw routeError(404, "Comment not found.")

  await db.transaction(async (tx) => {
    // Use the same lock as reply creation: a vote either precedes a hide or
    // observes the tombstone, never slips through a read-then-write window.
    const [comment] = await tx
      .select({ id: fumaComments.id, hiddenAt: fumaComments.hiddenAt })
      .from(fumaComments)
      .where(and(eq(fumaComments.id, commentId), eq(fumaComments.page, page)))
      .for("update")
      .limit(1)
    if (!comment) throw routeError(404, "Comment not found.")
    if (comment.hiddenAt) throw routeError(403, "This comment has been removed by a moderator.")

    await tx
      .insert(fumaRates)
      .values({ userId: auth.id, commentId, like: body.like })
      .onConflictDoUpdate({
        target: [fumaRates.userId, fumaRates.commentId],
        set: { like: body.like },
      })
  })
}

async function deleteRate({ id, page, auth }: DeleteRateOptions): Promise<void> {
  const commentId = parseCommentId(id)
  if (!commentId) throw routeError(404, "Comment not found.")

  // An un-vote remains available for a hidden comment, but the path must
  // still identify the same project as the rated comment.
  const [comment] = await db
    .select({ id: fumaComments.id })
    .from(fumaComments)
    .where(and(eq(fumaComments.id, commentId), eq(fumaComments.page, page)))
    .limit(1)
  if (!comment) throw routeError(404, "Comment not found.")

  await db
    .delete(fumaRates)
    .where(and(eq(fumaRates.commentId, commentId), eq(fumaRates.userId, auth.id)))
}

export const commentStorage: StorageAdapter = {
  ...fallbackStorage,
  getCommentAuthor: ({ id }) => getCommentAuthor(id),
  getComments,
  postComment,
  updateComment,
  deleteComment,
  setRate,
  deleteRate,
}
