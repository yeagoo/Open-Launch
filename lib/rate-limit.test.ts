import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  checkRateLimit,
  clearStatefulAlert,
  decideStatefulAlert,
  releaseRateLimitSlot,
  releaseStatefulAlert,
  reserveRateLimitSlot,
} from "./rate-limit"

const redisConnectMock = vi.hoisted(() => vi.fn())
const redisDelMock = vi.hoisted(() => vi.fn())
const redisEvalMock = vi.hoisted(() => vi.fn())
const redisOnMock = vi.hoisted(() => vi.fn())
const redisZremMock = vi.hoisted(() => vi.fn())

vi.mock("ioredis", () => ({
  default: class MockRedis {
    status = "wait"
    connect = redisConnectMock
    del = redisDelMock
    eval = redisEvalMock
    on = redisOnMock
    zrem = redisZremMock
  },
}))

describe("rate limit helpers", () => {
  beforeEach(() => {
    redisConnectMock.mockReset()
    redisDelMock.mockReset()
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

  it.each([
    [1, { shouldSend: true, reason: "new" }],
    [2, { shouldSend: true, reason: "changed" }],
    [3, { shouldSend: true, reason: "reminder" }],
    [0, { shouldSend: false, reason: "suppressed" }],
  ] as const)("maps Redis stateful alert decision %s", async (code, expected) => {
    redisConnectMock.mockResolvedValue(undefined)
    redisEvalMock.mockResolvedValue(code)

    await expect(
      decideStatefulAlert("cron-health", "fingerprint", "incident-a", 43_200),
    ).resolves.toEqual(expected)
    expect(redisEvalMock).toHaveBeenCalledWith(
      expect.any(String),
      1,
      "alert-state:cron-health",
      "fingerprint",
      "incident-a",
      expect.any(String),
      "43200",
      "172800",
    )
  })

  it("falls back to bounded process state when Redis is unavailable", async () => {
    const key = `cron-health-fallback-${Date.now()}`

    await expect(decideStatefulAlert(key, "fingerprint-a", "incident-a", 43_200)).resolves.toEqual({
      shouldSend: true,
      reason: "new",
    })
    await expect(decideStatefulAlert(key, "fingerprint-a", "incident-a", 43_200)).resolves.toEqual({
      shouldSend: false,
      reason: "suppressed",
    })
    await expect(decideStatefulAlert(key, "fingerprint-a", "incident-b", 43_200)).resolves.toEqual({
      shouldSend: true,
      reason: "changed",
    })
    await expect(decideStatefulAlert(key, "fingerprint-b", "incident-b", 43_200)).resolves.toEqual({
      shouldSend: true,
      reason: "changed",
    })

    await expect(clearStatefulAlert(key)).resolves.toBe(false)

    await expect(decideStatefulAlert(key, "fingerprint-a", "incident-a", 43_200)).resolves.toEqual({
      shouldSend: true,
      reason: "new",
    })
  })

  it("uses the safe fallback instead of suppressing an unknown Redis decision", async () => {
    const key = `cron-health-unknown-${Date.now()}`
    redisConnectMock.mockResolvedValue(undefined)
    redisEvalMock.mockResolvedValue(99)

    await expect(decideStatefulAlert(key, "fingerprint", "incident", 43_200)).resolves.toEqual({
      shouldSend: true,
      reason: "new",
    })
  })

  it("rejects invalid reminder intervals", async () => {
    await expect(decideStatefulAlert("cron-health", "fingerprint", "incident", 0)).rejects.toThrow(
      "reminderSeconds must be a finite positive number",
    )
    expect(redisConnectMock).not.toHaveBeenCalled()
  })

  it("clears shared alert state and reports success", async () => {
    redisConnectMock.mockResolvedValue(undefined)
    redisDelMock.mockResolvedValue(0)

    await expect(clearStatefulAlert("cron-health")).resolves.toBe(true)
    expect(redisDelMock).toHaveBeenCalledWith("alert-state:cron-health")
  })

  it("conditionally releases only the claimed incident", async () => {
    redisConnectMock.mockResolvedValue(undefined)
    redisEvalMock.mockResolvedValueOnce(0).mockResolvedValueOnce(1)

    await expect(
      releaseStatefulAlert("cron-health", "old-fingerprint", "old-incident"),
    ).resolves.toBe(false)
    await expect(
      releaseStatefulAlert("cron-health", "current-fingerprint", "current-incident"),
    ).resolves.toBe(true)
    expect(redisEvalMock).toHaveBeenNthCalledWith(
      1,
      expect.any(String),
      1,
      "alert-state:cron-health",
      "old-fingerprint",
      "old-incident",
    )
  })
})
