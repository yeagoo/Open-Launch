import { describe, expect, it } from "vitest"

import { isPlausibleServerActionId } from "./server-action-id"

describe("isPlausibleServerActionId", () => {
  it("accepts IDs emitted by both observed Next.js builds", () => {
    expect(isPlausibleServerActionId("a".repeat(40))).toBe(true)
    expect(isPlausibleServerActionId("00" + "b".repeat(40))).toBe(true)
  })

  it("rejects malformed probes without assuming one exact framework length", () => {
    expect(isPlausibleServerActionId("x")).toBe(false)
    expect(isPlausibleServerActionId("g".repeat(42))).toBe(false)
    expect(isPlausibleServerActionId("a".repeat(65))).toBe(false)
  })
})
