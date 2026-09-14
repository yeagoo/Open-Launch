/**
 * Client/server-safe pagination helpers for the comments endpoint.
 *
 * Fuma Comment exposes a flat comment list. The project UI renders roots
 * together with their direct replies, so it asks the storage adapter for one
 * page of roots plus their replies using this marker.
 */
export const COMMENT_WITH_REPLIES_THREAD = "__with_replies__"

export const COMMENT_PAGE_SIZE = 20
export const COMMENT_FETCH_LIMIT = COMMENT_PAGE_SIZE + 1

export interface ThreadedCommentCursor {
  id: string
  timestamp: string | Date
  threadId?: string
}

export interface ThreadedCommentPage<T> {
  comments: T[]
  hasMore: boolean
  nextBefore?: number
}

function toTimestamp(value: string | Date): number | undefined {
  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : undefined
}

/**
 * Removes the look-ahead root (and any replies belonging to it) from a flat
 * response. The remaining oldest root supplies Fuma's timestamp cursor.
 */
export function createThreadedCommentPage<T extends ThreadedCommentCursor>(
  rows: readonly T[],
  pageSize = COMMENT_PAGE_SIZE,
): ThreadedCommentPage<T> {
  const roots = rows.filter((row) => !row.threadId)
  const visibleRoots = roots.slice(0, pageSize)
  const visibleRootIds = new Set(visibleRoots.map((row) => row.id))
  const hasMore = roots.length > visibleRoots.length
  const lastRoot = visibleRoots.at(-1)

  return {
    comments: rows.filter((row) =>
      row.threadId ? visibleRootIds.has(row.threadId) : visibleRootIds.has(row.id),
    ),
    hasMore,
    nextBefore: hasMore && lastRoot ? toTimestamp(lastRoot.timestamp) : undefined,
  }
}

/** Keep cursor pagination resilient to equal timestamps or retried fetches. */
export function mergeCommentsById<T extends { id: string }>(
  current: readonly T[],
  incoming: readonly T[],
): T[] {
  const byId = new Map(current.map((comment) => [comment.id, comment]))
  for (const comment of incoming) byId.set(comment.id, comment)
  return [...byId.values()]
}
