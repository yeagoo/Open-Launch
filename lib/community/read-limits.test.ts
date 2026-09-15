import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  assertCommunityPageReadAllowed,
  assertCommunitySearchAllowed,
  isCommunitySearchAllowed,
} from "./read-limits"

const mocks = vi.hoisted(() => ({ headers: vi.fn(), rate: vi.fn() }))

vi.mock("next/headers", () => ({ headers: mocks.headers }))
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: mocks.rate }))

describe("community public-read limits", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.headers.mockResolvedValue(new Headers({ "cf-connecting-ip": "203.0.113.8" }))
    mocks.rate.mockResolvedValue({ success: true, remaining: 1, reset: 1 })
  })

  it("leaves ordinary indexed feeds unmetered and meters expensive search by trusted client IP", async () => {
    await expect(isCommunitySearchAllowed("")).resolves.toBe(true)
    expect(mocks.rate).not.toHaveBeenCalled()

    await expect(isCommunitySearchAllowed("release")).resolves.toBe(true)
    expect(mocks.rate).toHaveBeenCalledWith("community:search:203.0.113.8", 15, 60000, {
      onRedisError: "memory-fallback",
    })
  })

  it("rejects over-budget cursor-page actions with a safe retryable error", async () => {
    mocks.rate.mockResolvedValue({ success: false, remaining: 0, reset: 600 })
    await expect(assertCommunityPageReadAllowed()).rejects.toMatchObject({
      code: "retryable",
      message: "Too many community requests. Please wait before trying again",
    })
    expect(mocks.rate).toHaveBeenCalledWith("community:page:203.0.113.8", 120, 600000, {
      onRedisError: "memory-fallback",
    })
  })

  it("rejects an over-budget search before a cursor action can query the feed", async () => {
    mocks.rate.mockResolvedValue({ success: false, remaining: 0, reset: 60 })

    await expect(assertCommunitySearchAllowed("release")).rejects.toMatchObject({
      code: "retryable",
      message: "Too many community searches. Please wait before trying again",
    })
    expect(mocks.rate).toHaveBeenCalledWith("community:search:203.0.113.8", 15, 60000, {
      onRedisError: "memory-fallback",
    })
  })
})
