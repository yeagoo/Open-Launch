import "server-only"

import {
  communityBookmark as bookmark,
  project,
  communityReply as reply,
  communityFeedSnapshot as snapshot,
  communityThread as thread,
  user,
  communityThreadVote as vote,
} from "@/drizzle/db/schema"
import { and, asc, desc, eq, gt, gte, inArray, isNull, lt, or, sql, type SQL } from "drizzle-orm"
import { alias, union } from "drizzle-orm/pg-core"

import { stripHtml } from "@/lib/ai-input"

import {
  CommunityError,
  type CommunityPost,
  type CommunityReply,
  type FeedQuery,
  type PostType,
  type ProductContext,
} from "./contracts"
import { decodeCursor, encodeCursor, scopeHash } from "./cursor"
import { canReadBody, publicThread } from "./server-context"
import type { CommunityActor, CommunityTransaction, ReplyPage } from "./server-types"

const PAGE_SIZE = 20
const RECENT_SEARCH_PROBE_LIMIT = PAGE_SIZE * 25
const COMPOSER_PRODUCT_LIMIT = 100
const FEED_BODY_LIMIT = 480
const PRODUCT_DESCRIPTION_LIMIT = 180
const PRODUCT_SOURCE_DESCRIPTION_LIMIT = 2000

type CommunityThreadProjection = Pick<
  typeof thread.$inferSelect,
  | "id"
  | "authorId"
  | "type"
  | "projectId"
  | "title"
  | "body"
  | "lifecycle"
  | "moderation"
  | "lockedAt"
  | "pinnedUntil"
  | "version"
  | "voteCount"
  | "replyCount"
  | "createdAt"
  | "publishedAt"
> & {
  bodyTruncated?: boolean
}

type ProjectPostsOptions = {
  /** Author names are needed by cards and details, but not by the editor composer. */
  includeAuthorName?: boolean
  /** Vote and bookmark state is only needed by controls that render those actions. */
  includeInteractions?: boolean
}

// List queries avoid fetching up to 20 full 10 kB post bodies only to render a
// short card excerpt. Detail queries intentionally use the complete row.
const feedThreadSelection = {
  id: thread.id,
  authorId: thread.authorId,
  type: thread.type,
  projectId: thread.projectId,
  title: thread.title,
  body: sql<string>`left(${thread.body}, ${FEED_BODY_LIMIT})`.as("body"),
  bodyTruncated: sql<boolean>`char_length(${thread.body}) > ${FEED_BODY_LIMIT}`.as(
    "body_truncated",
  ),
  lifecycle: thread.lifecycle,
  moderation: thread.moderation,
  lockedAt: thread.lockedAt,
  pinnedUntil: thread.pinnedUntil,
  version: thread.version,
  voteCount: thread.voteCount,
  replyCount: thread.replyCount,
  createdAt: thread.createdAt,
  publishedAt: thread.publishedAt,
}

function productContext(row: { id: string; name: string; description: string }): ProductContext {
  return {
    id: row.id,
    name: row.name,
    // Project descriptions may be rich text and have no database length cap.
    // Product context is plain display text, never a rich HTML payload.
    description: stripHtml(row.description, PRODUCT_DESCRIPTION_LIMIT),
  }
}

const productContextSelection = {
  id: project.id,
  name: project.name,
  // A project description has no small database cap. Transfer only a bounded
  // prefix before stripping rich text down to the short community preview.
  description: sql<string>`left(${project.description}, ${PRODUCT_SOURCE_DESCRIPTION_LIMIT})`.as(
    "description",
  ),
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&")
}

/**
 * The composer intentionally receives a bounded recent public-product list.
 * It prevents a select control from serializing the full directory, while the
 * mutation still accepts any currently public product ID after a locked check.
 */
export async function listComposerProducts(tx: CommunityTransaction): Promise<ProductContext[]> {
  const products = await tx
    .select(productContextSelection)
    .from(project)
    .where(inArray(project.launchStatus, ["ongoing", "launched"]))
    .orderBy(desc(project.updatedAt), asc(project.name), asc(project.id))
    .limit(COMPOSER_PRODUCT_LIMIT)
  return products.map(productContext)
}
export async function projectPosts(
  tx: CommunityTransaction,
  rows: CommunityThreadProjection[],
  actor: CommunityActor | null,
  { includeAuthorName = true, includeInteractions = true }: ProjectPostsOptions = {},
): Promise<CommunityPost[]> {
  if (!rows.length) return []
  const authorIds = includeAuthorName
    ? [
        ...new Set(
          rows
            .filter((row) => canReadBody(row, actor))
            .map((row) => row.authorId)
            .filter((id): id is string => !!id),
        ),
      ]
    : []
  const projectIds = [
    ...new Set(
      rows
        .filter((row) => canReadBody(row, actor))
        .map((row) => row.projectId)
        .filter((id): id is string => !!id),
    ),
  ]
  const ids = rows.map((row) => row.id)
  // Sequential on a single transaction connection; constant query count, not one query per row.
  const names = authorIds.length
    ? await tx
        .select({ id: user.id, name: user.name })
        .from(user)
        .where(inArray(user.id, authorIds))
    : []
  const productRows = projectIds.length
    ? await tx
        .select(productContextSelection)
        .from(project)
        .where(
          and(
            inArray(project.id, projectIds),
            inArray(project.launchStatus, ["ongoing", "launched"]),
          ),
        )
    : []
  const votes =
    actor && includeInteractions
      ? await tx
          .select({ id: vote.threadId })
          .from(vote)
          .where(and(eq(vote.userId, actor.id), inArray(vote.threadId, ids)))
      : []
  const saved =
    actor && includeInteractions
      ? await tx
          .select({ id: bookmark.threadId })
          .from(bookmark)
          .where(and(eq(bookmark.userId, actor.id), inArray(bookmark.threadId, ids)))
      : []
  const nameMap = new Map(names.map((row) => [row.id, row.name])),
    productMap = new Map(productRows.map((row) => [row.id, productContext(row)]))
  const voted = new Set(votes.map((row) => row.id)),
    bookmarked = new Set(saved.map((row) => row.id))
  return rows.map((row) => {
    const readable = canReadBody(row, actor)
    return {
      id: row.id,
      authorId: readable || actor?.id === row.authorId ? (row.authorId ?? "") : "",
      author:
        readable && includeAuthorName ? (nameMap.get(row.authorId ?? "") ?? "Former member") : "",
      type: readable ? (row.type as PostType) : "Shipped",
      title: readable ? (row.title ?? "") : "",
      body: readable ? row.body : "",
      bodyTruncated: readable && row.bodyTruncated ? true : undefined,
      product: readable ? productMap.get(row.projectId ?? "") : undefined,
      votes: readable ? row.voteCount : 0,
      voted: readable && voted.has(row.id),
      saved: readable && bookmarked.has(row.id),
      replies: [],
      replyCount: readable ? row.replyCount : 0,
      state:
        row.lifecycle === "deleted"
          ? "deleted"
          : row.moderation === "pending"
            ? "pending"
            : row.moderation === "hidden"
              ? "hidden"
              : "public",
      locked: !!row.lockedAt,
      pinned: !!row.pinnedUntil && row.pinnedUntil > new Date(),
      version: readable || actor?.id === row.authorId ? row.version : 1,
      createdAt: readable ? row.createdAt.getTime() : 0,
    }
  })
}
export async function getPost(tx: CommunityTransaction, id: string, actor: CommunityActor | null) {
  const [row] = await tx.select().from(thread).where(eq(thread.id, id)).limit(1)
  if (
    !row ||
    row.lifecycle === "draft" ||
    (row.moderation === "pending" && !canReadBody(row, actor))
  )
    throw new CommunityError("missing", "Post not found")
  return (await projectPosts(tx, [row], actor))[0]!
}

/**
 * The editor needs only an open post owned by the current actor. Keep that
 * condition in the first query so an invalid editor URL cannot cause reply,
 * reaction, product, or author projections before its authorization fails.
 */
export async function getEditablePost(
  tx: CommunityTransaction,
  id: string,
  actor: CommunityActor | null,
) {
  if (!actor) throw new CommunityError("missing", "Post not found")
  const [row] = await tx
    .select()
    .from(thread)
    .where(
      and(
        eq(thread.id, id),
        eq(thread.authorId, actor.id),
        eq(thread.lifecycle, "published"),
        inArray(thread.moderation, ["public", "pending"]),
        isNull(thread.lockedAt),
      ),
    )
    .limit(1)
  if (!row) throw new CommunityError("missing", "Post not found")
  return (
    await projectPosts(tx, [row], actor, {
      includeAuthorName: false,
      includeInteractions: false,
    })
  )[0]!
}

async function getHotSnapshot(tx: CommunityTransaction, cursorId?: string) {
  const now = new Date()
  const id = cursorId ?? `hot-${Math.floor(now.getTime() / 300000)}`
  const [existing] = await tx
    .select()
    .from(snapshot)
    .where(and(eq(snapshot.id, id), gt(snapshot.expiresAt, now)))
  if (existing) return existing
  if (cursorId) throw new CommunityError("conflict", "This Hot view expired. Refresh to continue")
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('community:hot'),hashtext(${id}))`)
  const [raced] = await tx
    .select()
    .from(snapshot)
    .where(and(eq(snapshot.id, id), gt(snapshot.expiresAt, now)))
  if (raced) return raced
  // A single public snapshot, not one new database write per search/user.
  const candidates = await tx
    .select({ id: thread.id })
    .from(thread)
    .where(and(publicThread, gte(thread.publishedAt, new Date(now.getTime() - 7 * 86400000))))
    .orderBy(
      desc(sql`CASE WHEN ${thread.pinnedUntil}>${now} THEN 1 ELSE 0 END`),
      desc(thread.voteCount),
      desc(thread.publishedAt),
      desc(thread.id),
    )
    .limit(2000)
  await tx.delete(snapshot).where(lt(snapshot.expiresAt, now))
  const [created] = await tx
    .insert(snapshot)
    .values({
      id,
      threadIds: candidates.map((row) => row.id),
      expiresAt: new Date(now.getTime() + 15 * 60000),
    })
    .onConflictDoUpdate({
      target: snapshot.id,
      set: {
        threadIds: candidates.map((row) => row.id),
        expiresAt: new Date(now.getTime() + 15 * 60000),
      },
    })
    .returning()
  return created!
}
export async function listPosts(
  tx: CommunityTransaction,
  input: FeedQuery,
  actor: CommunityActor | null,
) {
  if (input.view !== "all" && !actor)
    throw new CommunityError("unauthorized", "Sign in to view your posts")
  const scope = scopeHash({ ...input, cursor: undefined, actor: actor?.id ?? null })
  const cursor = decodeCursor(input.cursor, scope)
  const clauses: SQL[] = []
  if (input.view === "mine")
    clauses.push(eq(thread.authorId, actor!.id), sql`${thread.lifecycle} <> 'draft'`)
  else clauses.push(publicThread)
  if (input.view === "saved")
    clauses.push(
      sql`EXISTS (SELECT 1 FROM ${bookmark} WHERE ${bookmark.threadId}=${thread.id} AND ${bookmark.userId}=${actor!.id})`,
    )
  if (input.type !== "All") clauses.push(eq(thread.type, input.type))
  const search = input.search.trim()
    ? `%${escapeLikePattern(input.search.trim().toLowerCase())}%`
    : undefined
  // Query validation requires at least three characters, allowing the GIN
  // trgm index to keep literal contains matching bounded. Escape LIKE's
  // wildcard characters so a search remains literal rather than becoming a
  // user-controlled pattern.
  const searchPredicate = search
    ? sql`(lower(coalesce(${thread.title},'') || ' ' || ${thread.body}) LIKE ${search} ESCAPE '\\' OR EXISTS (SELECT 1 FROM ${project} WHERE ${project.id}=${thread.projectId} AND ${project.launchStatus} IN ('ongoing','launched') AND ${project.name} ILIKE ${search} ESCAPE '\\'))`
    : undefined
  if (searchPredicate && (input.view !== "all" || input.sort === "Hot"))
    clauses.push(searchPredicate)
  // Personal views always use stable creation order and include own removed posts.
  if (input.sort === "Hot" && input.view === "all") {
    if (cursor && cursor.kind !== "hot")
      throw new CommunityError("validation", "Invalid Hot cursor")
    const snap = await getHotSnapshot(tx, cursor?.snapshot)
    const position = sql<number>`array_position(${snapshot.threadIds},${thread.id})`
    clauses.push(sql`${thread.id}=ANY(${snapshot.threadIds})`)
    if (cursor) clauses.push(gt(position, cursor.position))
    const rows = await tx
      .select({ thread: feedThreadSelection, position })
      .from(thread)
      .innerJoin(snapshot, eq(snapshot.id, snap.id))
      .where(and(...clauses))
      .orderBy(asc(position))
      .limit(PAGE_SIZE + 1)
    const shown = rows.slice(0, PAGE_SIZE),
      last = shown.at(-1)
    return {
      posts: await projectPosts(
        tx,
        shown.map((row) => row.thread),
        actor,
      ),
      nextCursor:
        rows.length > PAGE_SIZE && last
          ? encodeCursor({ kind: "hot", snapshot: snap.id, position: last.position, scope })
          : undefined,
    }
  }
  if (cursor && cursor.kind !== "date")
    throw new CommunityError("validation", "Invalid date cursor")
  const date = input.view === "mine" ? thread.createdAt : thread.publishedAt
  if (cursor)
    clauses.push(
      or(
        lt(date, new Date(cursor.date)),
        and(eq(date, new Date(cursor.date)), lt(thread.id, cursor.id)),
      )!,
    )
  let rows
  if (search && input.view === "all") {
    // A chronological probe handles common terms with the public-date index
    // instead of materializing every trigram hit. Its derived-table boundary
    // guarantees PostgreSQL examines only this bounded recent window before
    // evaluating the text/product predicate. If it cannot fill the page, a
    // rare old match falls through to the independently indexed candidate set.
    const recent = tx
      .select({ id: thread.id })
      .from(thread)
      .where(and(...clauses))
      .orderBy(desc(date), desc(thread.id))
      .limit(RECENT_SEARCH_PROBE_LIMIT)
      .as("community_recent_search_probe")
    const probeRows = await tx
      .select(feedThreadSelection)
      .from(thread)
      .innerJoin(recent, eq(thread.id, recent.id))
      .where(searchPredicate!)
      .orderBy(desc(date), desc(thread.id))
      .limit(PAGE_SIZE + 1)
    if (probeRows.length > PAGE_SIZE) rows = probeRows
    else {
      // The original `text OR EXISTS(product)` predicate can walk every
      // date-ordered row when a rare product-name hit is old. The fallback
      // starts from the 0064 text index and the established 0053 product-name
      // index, then uses community_thread_project_idx to locate linked posts.
      // Each branch needs only one page: anything below its first PAGE_SIZE +
      // 1 rows cannot belong to the merged first page. Scope every branch by
      // visibility, type, and cursor before it can materialize candidates.
      const textThread = alias(thread, "community_search_text_thread")
      const productThread = alias(thread, "community_search_product_thread")
      const searchProduct = alias(project, "community_search_product")
      const textClauses: SQL[] = [
        eq(textThread.lifecycle, "published"),
        eq(textThread.moderation, "public"),
        sql`lower(coalesce(${textThread.title},'') || ' ' || ${textThread.body}) LIKE ${search} ESCAPE '\\'`,
      ]
      const productClauses: SQL[] = [
        eq(productThread.lifecycle, "published"),
        eq(productThread.moderation, "public"),
        inArray(searchProduct.launchStatus, ["ongoing", "launched"]),
        sql`${searchProduct.name} ILIKE ${search} ESCAPE '\\'`,
      ]
      if (input.type !== "All") {
        textClauses.push(eq(textThread.type, input.type))
        productClauses.push(eq(productThread.type, input.type))
      }
      if (cursor) {
        const cursorDate = new Date(cursor.date)
        textClauses.push(
          or(
            lt(textThread.publishedAt, cursorDate),
            and(eq(textThread.publishedAt, cursorDate), lt(textThread.id, cursor.id)),
          )!,
        )
        productClauses.push(
          or(
            lt(productThread.publishedAt, cursorDate),
            and(eq(productThread.publishedAt, cursorDate), lt(productThread.id, cursor.id)),
          )!,
        )
      }
      const candidates = union(
        tx
          .select({ id: textThread.id })
          .from(textThread)
          .where(and(...textClauses))
          .orderBy(desc(textThread.publishedAt), desc(textThread.id))
          .limit(PAGE_SIZE + 1),
        tx
          .select({ id: productThread.id })
          .from(productThread)
          .innerJoin(searchProduct, eq(searchProduct.id, productThread.projectId))
          .where(and(...productClauses))
          .orderBy(desc(productThread.publishedAt), desc(productThread.id))
          .limit(PAGE_SIZE + 1),
      )
      rows = await tx
        .select(feedThreadSelection)
        .from(thread)
        .where(and(...clauses, sql`${thread.id} IN (${candidates})`))
        .orderBy(desc(date), desc(thread.id))
        .limit(PAGE_SIZE + 1)
    }
  } else {
    rows = await tx
      .select(feedThreadSelection)
      .from(thread)
      .where(and(...clauses))
      .orderBy(desc(date), desc(thread.id))
      .limit(PAGE_SIZE + 1)
  }
  const shown = rows.slice(0, PAGE_SIZE),
    last = shown.at(-1)
  return {
    posts: await projectPosts(tx, shown, actor),
    nextCursor:
      rows.length > PAGE_SIZE && last
        ? encodeCursor({
            kind: "date",
            date: (input.view === "mine" ? last.createdAt : last.publishedAt)!.toISOString(),
            id: last.id,
            scope,
          })
        : undefined,
  }
}
export async function listReplyPage(
  tx: CommunityTransaction,
  id: string,
  actor: CommunityActor | null,
  cursorValue?: string,
  knownPost?: CommunityPost,
): Promise<ReplyPage> {
  const post = knownPost ?? (await getPost(tx, id, actor))
  if (post.state !== "public") return { replies: [] }
  const scope = scopeHash({ thread: id, actor: actor?.id ?? null })
  const cursor = decodeCursor(cursorValue, scope)
  if (cursor && cursor.kind !== "date")
    throw new CommunityError("validation", "Invalid reply cursor")
  const clauses = [
    eq(reply.threadId, id),
    actor?.admin && actor.verified && !actor.blocked && !actor.bot
      ? sql`true`
      : or(sql`${reply.moderation}<>'pending'`, actor ? eq(reply.authorId, actor.id) : sql`false`)!,
  ]
  if (cursor)
    clauses.push(
      or(
        gt(reply.createdAt, new Date(cursor.date)),
        and(eq(reply.createdAt, new Date(cursor.date)), gt(reply.id, cursor.id)),
      )!,
    )
  const rows = await tx
    .select({ reply, name: user.name })
    .from(reply)
    .leftJoin(user, eq(reply.authorId, user.id))
    .where(and(...clauses))
    .orderBy(asc(reply.createdAt), asc(reply.id))
    .limit(PAGE_SIZE + 1)
  const shown = rows.slice(0, PAGE_SIZE),
    last = shown.at(-1)
  return {
    replies: shown.map(({ reply: row, name }): CommunityReply => {
      const visible = !row.deletedAt && row.moderation === "public"
      return {
        id: row.id,
        authorId: visible ? (row.authorId ?? "") : "",
        author: visible ? (name ?? "Former member") : "",
        body: visible ? row.body : "",
        createdAt: row.createdAt.getTime(),
        parentId: row.parentId ?? undefined,
        version: row.version,
        state: row.deletedAt ? "deleted" : visible ? "public" : "hidden",
      }
    }),
    nextCursor:
      rows.length > PAGE_SIZE && last
        ? encodeCursor({
            kind: "date",
            date: last.reply.createdAt.toISOString(),
            id: last.reply.id,
            scope,
          })
        : undefined,
  }
}
