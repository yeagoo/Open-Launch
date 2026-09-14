import { describe, expect, it } from "vitest"

import { createThreadedCommentPage, mergeCommentsById } from "@/lib/comment-pagination"

describe("threaded comment pagination", () => {
  it("keeps replies for visible roots and removes the look-ahead thread", () => {
    const rows = [
      { id: "root-new", timestamp: "2026-09-14T12:00:00.000Z" },
      { id: "root-old", timestamp: "2026-09-14T11:00:00.000Z" },
      { id: "root-lookahead", timestamp: "2026-09-14T10:00:00.000Z" },
      { id: "reply-new", threadId: "root-new", timestamp: "2026-09-14T12:01:00.000Z" },
      { id: "reply-lookahead", threadId: "root-lookahead", timestamp: "2026-09-14T10:01:00.000Z" },
    ]

    expect(createThreadedCommentPage(rows, 2)).toEqual({
      comments: [rows[0], rows[1], rows[3]],
      hasMore: true,
      nextBefore: Date.parse("2026-09-14T11:00:00.000Z"),
    })
  })

  it("deduplicates a repeated cursor result without changing root order", () => {
    expect(
      mergeCommentsById(
        [
          { id: "one", value: 1 },
          { id: "two", value: 2 },
        ],
        [
          { id: "two", value: 20 },
          { id: "three", value: 3 },
        ],
      ),
    ).toEqual([
      { id: "one", value: 1 },
      { id: "two", value: 20 },
      { id: "three", value: 3 },
    ])
  })
})
