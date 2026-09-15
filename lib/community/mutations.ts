import "server-only"

import {
  communityBookmark as bookmark,
  communityReply as reply,
  communityThread as thread,
  communityThreadVote as vote,
} from "@/drizzle/db/schema"
import { and, eq, sql } from "drizzle-orm"

import {
  CommunityError,
  type CommunityBookmarkState,
  type CommunityPostReaction,
  type CommunityVoteState,
  type PostDraft,
} from "./contracts"
import { scopeHash } from "./cursor"
import { assertOpen, draftLock, lockThread, validateProduct } from "./server-context"
import type { CommunityActor, CommunityTransaction } from "./server-types"

export async function saveDraft(tx: CommunityTransaction, actor: CommunityActor, draft: PostDraft) {
  await draftLock(tx, actor.id)
  const projectId = await validateProduct(tx, draft.productId)
  const [current] = await tx
    .select({ id: thread.id })
    .from(thread)
    .where(and(eq(thread.authorId, actor.id), eq(thread.lifecycle, "draft")))
    .for("update")
  if (!draft.body.trim() && !draft.title.trim()) {
    if (current) await tx.delete(thread).where(eq(thread.id, current.id))
    return
  }
  const values = {
    authorId: actor.id,
    type: draft.type,
    body: draft.body,
    title: draft.title || null,
    projectId,
    updatedAt: new Date(),
  }
  if (current) await tx.update(thread).set(values).where(eq(thread.id, current.id))
  else await tx.insert(thread).values(values)
}
export async function publish(
  tx: CommunityTransaction,
  actor: CommunityActor,
  draft: PostDraft,
  key: string,
) {
  await draftLock(tx, actor.id)
  const hash = scopeHash(draft)
  const [existing] = await tx
    .select()
    .from(thread)
    .where(and(eq(thread.authorId, actor.id), eq(thread.requestKey, key)))
  if (existing) {
    if (existing.requestHash !== hash)
      throw new CommunityError(
        "conflict",
        "This request key was already used for different content",
      )
    return existing.id
  }
  const projectId = await validateProduct(tx, draft.productId)
  const [created] = await tx
    .insert(thread)
    .values({
      authorId: actor.id,
      type: draft.type,
      title: draft.title.trim() || null,
      body: draft.body.trim(),
      projectId,
      lifecycle: "published",
      publishedAt: new Date(),
      requestKey: key,
      requestHash: hash,
    })
    .returning({ id: thread.id })
  // A concurrent editor's newer saved draft must not be erased by an old publish.
  await tx
    .delete(thread)
    .where(
      and(
        eq(thread.authorId, actor.id),
        eq(thread.lifecycle, "draft"),
        eq(thread.body, draft.body),
        sql`coalesce(${thread.title},'')=${draft.title}`,
        eq(thread.type, draft.type),
        sql`coalesce(${thread.projectId},'')=${draft.productId}`,
      ),
    )
  return created!.id
}
function editable(row: typeof thread.$inferSelect, actor: CommunityActor, version: number) {
  if (row.authorId !== actor.id)
    throw new CommunityError("forbidden", "Only the author can edit this post")
  if (row.lifecycle !== "published" || row.moderation === "hidden" || row.lockedAt)
    throw new CommunityError("forbidden", "Post is not open for editing")
  if (row.version !== version)
    throw new CommunityError("conflict", "Post changed. Reload the latest version before editing")
}
export async function editPost(
  tx: CommunityTransaction,
  actor: CommunityActor,
  id: string,
  draft: PostDraft,
  version: number,
) {
  const projectId = await validateProduct(tx, draft.productId)
  const row = await lockThread(tx, id)
  editable(row, actor, version)
  await tx
    .update(thread)
    .set({
      title: draft.title.trim() || null,
      body: draft.body.trim(),
      type: draft.type,
      projectId,
      updatedAt: new Date(),
      version: row.version + 1,
    })
    .where(eq(thread.id, id))
}
export async function deletePost(
  tx: CommunityTransaction,
  actor: CommunityActor,
  id: string,
  version: number,
) {
  const row = await lockThread(tx, id)
  if (row.authorId !== actor.id)
    throw new CommunityError("forbidden", "Only the author can delete this post")
  if (row.lifecycle === "deleted") return
  if (row.version !== version)
    throw new CommunityError("conflict", "Post changed. Reload before deleting")
  await tx
    .update(thread)
    .set({ lifecycle: "deleted", updatedAt: new Date(), version: row.version + 1 })
    .where(eq(thread.id, id))
}
export function react(
  tx: CommunityTransaction,
  actor: CommunityActor,
  id: string,
  desired: boolean,
  kind: "vote",
): Promise<CommunityVoteState>
export function react(
  tx: CommunityTransaction,
  actor: CommunityActor,
  id: string,
  desired: boolean,
  kind: "bookmark",
): Promise<CommunityBookmarkState>
export async function react(
  tx: CommunityTransaction,
  actor: CommunityActor,
  id: string,
  desired: boolean,
  kind: "vote" | "bookmark",
): Promise<CommunityPostReaction> {
  const row = await lockThread(tx, id)
  if (row.lifecycle !== "published" || row.moderation !== "public")
    throw new CommunityError("missing", "Post unavailable")
  if (kind === "vote") {
    const changed = desired
      ? await tx
          .insert(vote)
          .values({ threadId: id, userId: actor.id })
          .onConflictDoNothing()
          .returning({ threadId: vote.threadId })
      : await tx
          .delete(vote)
          .where(and(eq(vote.threadId, id), eq(vote.userId, actor.id)))
          .returning({ threadId: vote.threadId })
    return {
      id,
      kind,
      votes: row.voteCount + (desired ? changed.length : -changed.length),
      voted: desired,
    }
  }
  if (desired)
    await tx.insert(bookmark).values({ threadId: id, userId: actor.id }).onConflictDoNothing()
  else
    await tx.delete(bookmark).where(and(eq(bookmark.threadId, id), eq(bookmark.userId, actor.id)))
  return { id, kind, saved: desired }
}
export async function createReply(
  tx: CommunityTransaction,
  actor: CommunityActor,
  id: string,
  body: string,
  key: string,
  parentId?: string,
) {
  const post = await lockThread(tx, id)
  const hash = scopeHash({ body, parentId: parentId ?? null })
  const [existing] = await tx
    .select()
    .from(reply)
    .where(and(eq(reply.authorId, actor.id), eq(reply.threadId, id), eq(reply.requestKey, key)))
  if (existing) {
    if (existing.requestHash !== hash)
      throw new CommunityError(
        "conflict",
        "This request key was already used for a different reply",
      )
    if (
      post.lifecycle !== "published" ||
      post.moderation !== "public" ||
      existing.deletedAt ||
      existing.moderation !== "public"
    )
      throw new CommunityError("missing", "Reply unavailable")
    return existing
  }
  assertOpen(post)
  if (parentId) {
    const [parent] = await tx
      .select()
      .from(reply)
      .where(and(eq(reply.id, parentId), eq(reply.threadId, id)))
      .for("share")
    if (!parent || parent.parentId || parent.deletedAt || parent.moderation !== "public")
      throw new CommunityError("validation", "Choose a visible root reply in this thread")
  }
  const [created] = await tx
    .insert(reply)
    .values({
      authorId: actor.id,
      threadId: id,
      body: body.trim(),
      parentId,
      requestKey: key,
      requestHash: hash,
    })
    .returning()
  return created!
}
export async function editReply(
  tx: CommunityTransaction,
  actor: CommunityActor,
  id: string,
  version: number,
  body?: string,
) {
  const [pointer] = await tx
    .select({ threadId: reply.threadId })
    .from(reply)
    .where(eq(reply.id, id))
  if (!pointer) throw new CommunityError("missing", "Reply not found")
  const post = await lockThread(tx, pointer.threadId)
  const [row] = await tx.select().from(reply).where(eq(reply.id, id)).for("update")
  if (!row || row.authorId !== actor.id)
    throw new CommunityError("forbidden", "Only the author can edit this reply")
  if (body === undefined && row.deletedAt) return
  if (row.version !== version)
    throw new CommunityError("conflict", "Reply changed. Reload before editing")
  if (body !== undefined) {
    assertOpen(post)
    if (row.deletedAt || row.moderation !== "public")
      throw new CommunityError("forbidden", "This reply is not editable")
  }
  await tx
    .update(reply)
    .set({
      ...(body === undefined ? { deletedAt: new Date() } : { body: body.trim() }),
      version: row.version + 1,
      updatedAt: new Date(),
    })
    .where(eq(reply.id, id))
}
