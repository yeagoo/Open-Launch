/**
 * RateLimiter unit tests.
 *
 * Uses small windows (100-300ms) so the suite stays fast. The semantics
 * (FIFO order, capacity blocking, timeout reject, drain after window) are
 * the same regardless of window size.
 */

import { describe, expect, it } from "vitest"

import { RateLimiter } from "./rate-limiter"

describe("RateLimiter", () => {
  it("admits up to maxPerWindow without blocking", async () => {
    const limiter = new RateLimiter(5, 1000)
    const start = Date.now()
    await Promise.all([
      limiter.acquire(),
      limiter.acquire(),
      limiter.acquire(),
      limiter.acquire(),
      limiter.acquire(),
    ])
    expect(Date.now() - start).toBeLessThan(50)
    expect(limiter.inFlightCount()).toBe(5)
  })

  it("queues the (max+1)th call until the oldest slot ages out", async () => {
    const limiter = new RateLimiter(3, 200)
    const start = Date.now()
    await limiter.acquire()
    await limiter.acquire()
    await limiter.acquire()
    // 4th call should block ~200ms (until the first slot expires)
    await limiter.acquire()
    const elapsed = Date.now() - start
    expect(elapsed).toBeGreaterThanOrEqual(180)
    expect(elapsed).toBeLessThan(500)
  })

  it("preserves FIFO order under burst", async () => {
    const limiter = new RateLimiter(2, 200)
    const order: number[] = []
    const promises = [0, 1, 2, 3, 4].map((i) => limiter.acquire().then(() => order.push(i)))
    await Promise.all(promises)
    expect(order).toEqual([0, 1, 2, 3, 4])
  })

  it("rejects when queue wait exceeds timeoutMs", async () => {
    const limiter = new RateLimiter(1, 1000)
    await limiter.acquire() // fills the only slot for 1s
    await expect(limiter.acquire(50)).rejects.toThrow(/timed out/)
  })

  it("drains the queue when the window slides", async () => {
    const limiter = new RateLimiter(2, 150)
    const start = Date.now()
    await Promise.all([
      limiter.acquire(),
      limiter.acquire(),
      limiter.acquire(), // waits ~150ms
      limiter.acquire(), // waits ~150ms
    ])
    const elapsed = Date.now() - start
    expect(elapsed).toBeGreaterThanOrEqual(140)
    // All four should resolve in roughly one window — not two windows.
    expect(elapsed).toBeLessThan(500)
  })

  it("queueDepth reflects pending callers", async () => {
    const limiter = new RateLimiter(1, 500)
    await limiter.acquire()
    const p1 = limiter.acquire()
    const p2 = limiter.acquire()
    // Yield to let the queue settle.
    await new Promise((r) => setTimeout(r, 10))
    expect(limiter.queueDepth).toBe(2)
    await Promise.all([p1, p2]) // drain
    expect(limiter.queueDepth).toBe(0)
  })

  it("rejects invalid construction", () => {
    expect(() => new RateLimiter(0, 1000)).toThrow()
    expect(() => new RateLimiter(5, 0)).toThrow()
  })

  it("large bursts beyond capacity still all resolve in order", async () => {
    const limiter = new RateLimiter(5, 100)
    const order: number[] = []
    const promises = Array.from({ length: 12 }, (_, i) =>
      limiter.acquire().then(() => order.push(i)),
    )
    await Promise.all(promises)
    expect(order).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
  })
})
