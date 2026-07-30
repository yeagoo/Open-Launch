import { describe, expect, it } from "vitest"

import {
  attachUserUpvotesToGroups,
  getUtcMonthWindow,
  uniqueProjectIdsFromGroups,
} from "./home-project-groups"

describe("home project group user augmentation", () => {
  it("uses an exclusive UTC month window independent of the server timezone", () => {
    expect(getUtcMonthWindow(new Date("2026-07-31T23:30:00-07:00"))).toEqual({
      start: new Date("2026-08-01T00:00:00.000Z"),
      end: new Date("2026-09-01T00:00:00.000Z"),
    })
    expect(getUtcMonthWindow(new Date("2026-01-15T00:00:00.000Z"))).toEqual({
      start: new Date("2026-01-01T00:00:00.000Z"),
      end: new Date("2026-02-01T00:00:00.000Z"),
    })
    expect(() => getUtcMonthWindow(new Date("invalid"))).toThrow()
  })

  it("preserves empty groups without producing lookup IDs", () => {
    const groups: { id: string }[][] = [[], [], []]

    expect(uniqueProjectIdsFromGroups(groups)).toEqual([])
    expect(attachUserUpvotesToGroups(groups, new Set())).toEqual([[], [], []])
  })

  it("marks a single project without changing its other fields", () => {
    const project = { id: "one", name: "One", upvoteCount: 1, commentCount: 1 }

    expect(uniqueProjectIdsFromGroups([[project], [], []])).toEqual(["one"])
    expect(attachUserUpvotesToGroups([[project], [], []], new Set(["one"]))[0]).toEqual([
      { ...project, userHasUpvoted: true },
    ])
  })

  it("deduplicates overlapping IDs and applies one shared upvote set to every group", () => {
    const today = [
      { id: "popular", upvoteCount: 100, commentCount: 80 },
      { id: "plain", upvoteCount: 0, commentCount: 0 },
    ]
    const yesterday = [{ id: "popular", upvoteCount: 100, commentCount: 80 }]
    const month = [{ id: "other", upvoteCount: 4, commentCount: 7 }]
    const groups = [today, yesterday, month]

    expect(uniqueProjectIdsFromGroups(groups)).toEqual(["popular", "plain", "other"])
    expect(attachUserUpvotesToGroups(groups, new Set(["popular", "other"]))).toEqual([
      [
        { ...today[0], userHasUpvoted: true },
        { ...today[1], userHasUpvoted: false },
      ],
      [{ ...yesterday[0], userHasUpvoted: true }],
      [{ ...month[0], userHasUpvoted: true }],
    ])
  })
})
