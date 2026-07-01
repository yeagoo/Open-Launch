import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { checkRateLimit } from "./rate-limit"

const redisConnectMock = vi.hoisted(() => vi.fn())
const redisOnMock = vi.hoisted(() => vi.fn())

vi.mock("ioredis", () => ({
  default: class MockRedis {
    status = "wait"
    connect = redisConnectMock
    on = redisOnMock
  },
}))

describe("checkRateLimit", () => {
  beforeEach(() => {
    redisConnectMock.mockRejectedValue(new Error("redis unavailable"))
    redisOnMock.mockReset()
    vi.spyOn(console, "error").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("supports non-consuming preflight checks in the memory fallback", async () => {
    const key = `preflight-${Date.now()}`

    await expect(checkRateLimit(key, 1, 60_000, { consume: false })).resolves.toMatchObject({
      success: true,
      remaining: 1,
    })
    await expect(checkRateLimit(key, 1, 60_000, { consume: false })).resolves.toMatchObject({
      success: true,
      remaining: 1,
    })

    await expect(checkRateLimit(key, 1, 60_000)).resolves.toMatchObject({
      success: true,
      remaining: 0,
    })
    await expect(checkRateLimit(key, 1, 60_000, { consume: false })).resolves.toMatchObject({
      success: false,
      remaining: 0,
    })
  })
})
