import { describe, expect, it, vi } from "vitest"

import { withEngagementCounts } from "@/lib/project-enrich"

vi.mock("@/drizzle/db", () => ({ db: {} }))

describe("withEngagementCounts", () => {
  it("adds batched counts and gives projects without engagement a zero value", () => {
    const projects = [
      { id: "project-with-votes", name: "Votes" },
      { id: "project-with-comments", name: "Comments" },
      { id: "project-without-engagement", name: "None" },
    ]
    const counts = new Map([
      ["project-with-votes", { upvoteCount: 4, commentCount: 0 }],
      ["project-with-comments", { upvoteCount: 0, commentCount: 3 }],
    ])

    expect(withEngagementCounts(projects, counts)).toEqual([
      { id: "project-with-votes", name: "Votes", upvoteCount: 4, commentCount: 0 },
      { id: "project-with-comments", name: "Comments", upvoteCount: 0, commentCount: 3 },
      { id: "project-without-engagement", name: "None", upvoteCount: 0, commentCount: 0 },
    ])
  })
})
