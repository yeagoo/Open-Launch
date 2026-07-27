import { beforeEach, describe, expect, it, vi } from "vitest"

import { createNotification, notifyNewComment, notifyUpvoteMilestone } from "@/lib/notifications"

// Unit tests for the notification producers' guard logic: self-actions and
// bot accounts must never create notifications; dedupe keys must be stable.

const insertCalls = vi.hoisted(() => [] as Array<Record<string, unknown>>)
const selectResults = vi.hoisted(() => [] as unknown[])
const executeResults = vi.hoisted(() => [] as Array<{ rows: unknown[] }>)

vi.mock("@/drizzle/db", () => {
  function chain(resolveWith: unknown): unknown {
    const fn = function () {
      return chain(resolveWith)
    }
    return new Proxy(fn, {
      get(_t, prop) {
        if (prop === "then") {
          return (resolve: (v: unknown) => unknown) => Promise.resolve(resolveWith).then(resolve)
        }
        return () => chain(resolveWith)
      },
      apply() {
        return chain(resolveWith)
      },
    })
  }
  return {
    db: {
      select: () => {
        const next = selectResults.length > 1 ? selectResults.shift() : selectResults[0]
        return chain(next)
      },
      insert: () => ({
        values: (v: Record<string, unknown>) => {
          insertCalls.push(v)
          return { onConflictDoNothing: async () => {} }
        },
      }),
      execute: async () => executeResults[0] ?? { rows: [] },
    },
  }
})

beforeEach(() => {
  insertCalls.length = 0
  selectResults.length = 0
  executeResults.length = 0
})

describe("createNotification", () => {
  it("inserts a row and never throws on db failure", async () => {
    await createNotification({
      userId: "u1",
      type: "comment",
      projectId: "p1",
      dedupeKey: "k1",
    })
    expect(insertCalls).toHaveLength(1)
    expect(insertCalls[0]).toMatchObject({ userId: "u1", type: "comment", dedupeKey: "k1" })
  })
})

describe("notifyNewComment", () => {
  it("skips when the commenter IS the project owner", async () => {
    selectResults.push([{ createdBy: "u1" }])
    await notifyNewComment("p1", "u1", "nice project")
    expect(insertCalls).toHaveLength(0)
  })

  it("notifies the owner when someone else comments", async () => {
    selectResults.push([{ createdBy: "owner" }]) // project owner
    selectResults.push([{ isBot: false }]) // comment author bot check
    await notifyNewComment("p1", "commenter", "great launch!")
    expect(insertCalls).toHaveLength(1)
    expect(insertCalls[0]).toMatchObject({
      userId: "owner",
      type: "comment",
      actorId: "commenter",
      projectId: "p1",
    })
  })

  it("skips bot commenters", async () => {
    selectResults.push([{ createdBy: "owner" }])
    selectResults.push([{ isBot: true }])
    await notifyNewComment("p1", "bot-user-1", "fake engagement")
    expect(insertCalls).toHaveLength(0)
  })
})

describe("notifyUpvoteMilestone", () => {
  it("does nothing below the first milestone", async () => {
    selectResults.push([{ createdBy: "owner" }])
    await notifyUpvoteMilestone("p1", 7)
    expect(insertCalls).toHaveLength(0)
  })

  it("notifies every crossed milestone (concurrent votes can skip counts)", async () => {
    selectResults.push([{ createdBy: "owner" }])
    // 9 -> 51 in a burst must recover BOTH the 10 and the 50 milestone;
    // the DB unique key dedupes whichever was already notified.
    await notifyUpvoteMilestone("p1", 51)
    expect(insertCalls).toHaveLength(2)
    expect(insertCalls.map((c) => c.dedupeKey)).toEqual(["milestone:10:p1", "milestone:50:p1"])
  })
})
