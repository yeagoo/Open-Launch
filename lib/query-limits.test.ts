import { describe, expect, it } from "vitest"

import { clampInteger, clampPage } from "@/lib/query-limits"

describe("query limit normalization", () => {
  it("clamps and floors finite integers", () => {
    expect(clampInteger(2000, 10, 1, 100)).toBe(100)
    expect(clampInteger(-5, 10, 1, 100)).toBe(1)
    expect(clampInteger(9.8, 10, 1, 100)).toBe(9)
  })

  it("uses a safe fallback for non-finite input", () => {
    expect(clampInteger(Number.NaN, 10, 1, 100)).toBe(10)
    expect(clampInteger(Number.POSITIVE_INFINITY, 10, 1, 100)).toBe(10)
    expect(clampPage(-1)).toBe(1)
  })
})
