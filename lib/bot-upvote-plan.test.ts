import { describe, expect, it } from "vitest"

import {
  dailyVoteTarget,
  FREE_VOTE_RANGE,
  isPaidLaunchType,
  PAID_VOTE_RANGE,
  votesDueByNow,
} from "./bot-upvote-plan"

const WINDOW_START = Date.UTC(2026, 4, 29, 8, 0, 0)
const WINDOW_END = Date.UTC(2026, 4, 30, 8, 0, 0)

describe("isPaidLaunchType", () => {
  it("treats premium and premium_plus as paid", () => {
    expect(isPaidLaunchType("premium")).toBe(true)
    expect(isPaidLaunchType("premium_plus")).toBe(true)
  })

  it("treats free queue (incl. badge) and unknowns as not paid", () => {
    expect(isPaidLaunchType("free")).toBe(false)
    expect(isPaidLaunchType("free_with_badge")).toBe(false)
    expect(isPaidLaunchType(null)).toBe(false)
    expect(isPaidLaunchType(undefined)).toBe(false)
  })
})

describe("dailyVoteTarget", () => {
  it("keeps free targets within the free band", () => {
    for (let i = 0; i < 200; i++) {
      const t = dailyVoteTarget(`proj-${i}`, WINDOW_START, false)
      expect(t).toBeGreaterThanOrEqual(FREE_VOTE_RANGE.min)
      expect(t).toBeLessThanOrEqual(FREE_VOTE_RANGE.max)
    }
  })

  it("keeps paid targets within the paid band", () => {
    for (let i = 0; i < 200; i++) {
      const t = dailyVoteTarget(`proj-${i}`, WINDOW_START, true)
      expect(t).toBeGreaterThanOrEqual(PAID_VOTE_RANGE.min)
      expect(t).toBeLessThanOrEqual(PAID_VOTE_RANGE.max)
    }
  })

  it("is stable for the same project + window + tier", () => {
    const a = dailyVoteTarget("proj-x", WINDOW_START, false)
    const b = dailyVoteTarget("proj-x", WINDOW_START, false)
    expect(a).toBe(b)
  })

  it("varies the target when the window changes", () => {
    const today = dailyVoteTarget("proj-x", WINDOW_START, false)
    const tomorrow = dailyVoteTarget("proj-x", WINDOW_END, false)
    // Not a hard guarantee, but for this fixed pair the seeds differ.
    expect(today).not.toBe(tomorrow)
  })

  it("produces a spread of targets across projects (not all identical)", () => {
    const targets = new Set(
      Array.from({ length: 50 }, (_, i) => dailyVoteTarget(`proj-${i}`, WINDOW_START, false)),
    )
    expect(targets.size).toBeGreaterThan(5)
  })
})

describe("votesDueByNow", () => {
  const SPAN = WINDOW_END - WINDOW_START

  it("is 0 at the window start", () => {
    expect(votesDueByNow(200, WINDOW_START, WINDOW_END, WINDOW_START)).toBe(0)
  })

  it("reaches the full target once the ramp completes (default 75% in)", () => {
    const rampDone = WINDOW_START + SPAN * 0.75
    expect(votesDueByNow(200, WINDOW_START, WINDOW_END, rampDone)).toBe(200)
  })

  it("holds at the full target after the ramp and at the window end", () => {
    const after = WINDOW_START + SPAN * 0.9
    expect(votesDueByNow(200, WINDOW_START, WINDOW_END, after)).toBe(200)
    expect(votesDueByNow(200, WINDOW_START, WINDOW_END, WINDOW_END)).toBe(200)
  })

  it("reaches the full target by the 06:00 tick (~22/24 of the window)", () => {
    // The last effective cron tick before the window rolls over.
    const lastTick = WINDOW_START + SPAN * (22 / 24)
    expect(votesDueByNow(250, WINDOW_START, WINDOW_END, lastTick)).toBe(250)
  })

  it("ramps linearly before completion (half of the ramp = half the target)", () => {
    const halfRamp = WINDOW_START + SPAN * 0.375 // 0.375 / 0.75 = 0.5
    expect(votesDueByNow(200, WINDOW_START, WINDOW_END, halfRamp)).toBe(100)
  })

  it("clamps before the window and after the window", () => {
    expect(votesDueByNow(200, WINDOW_START, WINDOW_END, WINDOW_START - 10_000)).toBe(0)
    expect(votesDueByNow(200, WINDOW_START, WINDOW_END, WINDOW_END + 10_000)).toBe(200)
  })

  it("is monotonically non-decreasing through the window", () => {
    let prev = -1
    for (let f = 0; f <= 10; f++) {
      const now = WINDOW_START + (SPAN * f) / 10
      const due = votesDueByNow(180, WINDOW_START, WINDOW_END, now)
      expect(due).toBeGreaterThanOrEqual(prev)
      prev = due
    }
  })
})
