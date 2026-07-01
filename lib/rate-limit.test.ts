import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { checkRateLimit, releaseRateLimitSlot, reserveRateLimitSlot } from "./rate-limit"

const redisConnectMock = vi.hoisted(() => vi.fn())
const redisEvalMock = vi.hoisted(() => vi.fn())
const redisOnMock = vi.hoisted(() => vi.fn())
const redisZremMock = vi.hoisted(() => vi.fn())

vi.mock("ioredis", () => ({
  default: class MockRedis {
    status = "wait"
    connect = redisConnectMock
    eval = redisEvalMock
    on = redisOnMock
    zrem = redisZremMock
  },
}))

describe("rate limit helpers", () => {
  beforeEach(() => {
    redisConnectMock.mockReset()
    redisEvalMock.mockReset()
    redisZremMock.mockReset()
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

  it("reserves and releases Redis-backed slots", async () => {
    redisConnectMock.mockResolvedValue(undefined)
    redisEvalMock.mockResolvedValue([1, 0, 300, "slot-token"])
    redisZremMock.mockResolvedValue(1)

    const result = await reserveRateLimitSlot("skill-quota:user-1", 3, 2, 300_000)

    expect(result).toMatchObject({
      success: true,
      remaining: 0,
      reset: 300,
      token: "slot-token",
    })
    expect(redisEvalMock).toHaveBeenCalledWith(
      expect.any(String),
      1,
      "rate-limit-reservation:skill-quota:user-1",
      expect.any(String),
      "3",
      "2",
      expect.any(String),
      "300000",
      expect.any(String),
      "300",
    )

    await releaseRateLimitSlot("skill-quota:user-1", "slot-token")

    expect(redisZremMock).toHaveBeenCalledWith(
      "rate-limit-reservation:skill-quota:user-1",
      "slot-token",
    )
  })

  it("fails closed when a slot reservation cannot reach Redis", async () => {
    await expect(reserveRateLimitSlot("skill-quota:user-2", 3, 0, 300_000)).resolves.toMatchObject({
      success: false,
      remaining: 0,
      reset: 300,
    })
  })
})
