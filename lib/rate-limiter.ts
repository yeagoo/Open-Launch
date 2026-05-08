/**
 * Sliding-window rate limiter with FIFO queue.
 *
 * Each `acquire()` returns a promise that resolves once the caller is
 * inside the rate budget. Calls beyond `maxPerWindow` within `windowMs`
 * queue in submission order and resolve as soon as a slot opens.
 *
 * Example: `new RateLimiter(25, 60_000)` matches Tinyfish Fetch's
 * 25 URLs/min cap. A burst of 30 acquire() calls returns 25 instantly,
 * the remaining 5 wait until 60s after their respective predecessors
 * fired.
 *
 * Single-process. Resets on restart (the upstream rate window is
 * per-minute, so a brief restart loses ≤60s of budget — acceptable).
 * For multi-replica coordination, swap to a Redis-backed limiter.
 */

export class RateLimiter {
  private readonly slots: number[] = []
  private readonly queue: Array<{
    resolve: () => void
    reject: (err: Error) => void
    deadline: number
  }> = []
  private processing = false

  constructor(
    private readonly maxPerWindow: number,
    private readonly windowMs: number,
  ) {
    if (maxPerWindow <= 0 || windowMs <= 0) {
      throw new Error("RateLimiter requires positive maxPerWindow and windowMs")
    }
  }

  /**
   * Block until the caller can proceed. Throws if the wait exceeds
   * `timeoutMs` (default 5 min) — at which point the caller should give
   * up rather than back up the queue indefinitely.
   */
  async acquire(timeoutMs: number = 5 * 60_000): Promise<void> {
    return new Promise((resolve, reject) => {
      this.queue.push({ resolve, reject, deadline: Date.now() + timeoutMs })
      void this.processQueue()
    })
  }

  /** Current queued (waiting) count — useful for monitoring. */
  get queueDepth(): number {
    return this.queue.length
  }

  /**
   * Number of `acquire()` grants made in the past `windowMs` — useful for
   * monitoring. Note: this counts *issued* requests, not currently-running
   * ones. A slot stays counted until it ages out, even if the caller's
   * downstream work has already finished or failed.
   */
  slotsInWindow(): number {
    this.evictExpired()
    return this.slots.length
  }

  private evictExpired() {
    const cutoff = Date.now() - this.windowMs
    while (this.slots.length > 0 && this.slots[0] <= cutoff) this.slots.shift()
  }

  private async processQueue(): Promise<void> {
    if (this.processing) return
    this.processing = true
    try {
      while (this.queue.length > 0) {
        const head = this.queue[0]

        if (Date.now() > head.deadline) {
          this.queue.shift()
          head.reject(
            new Error(
              `RateLimiter: queued ${this.maxPerWindow}/${this.windowMs}ms call timed out (queue depth was ${this.queue.length + 1})`,
            ),
          )
          continue
        }

        this.evictExpired()

        if (this.slots.length < this.maxPerWindow) {
          this.slots.push(Date.now())
          this.queue.shift()
          head.resolve()
          continue
        }

        // Wait until the oldest slot ages out, then re-check. Add a small
        // pad so floating-point/clock jitter doesn't make us wake too
        // early and re-loop without progress.
        const waitMs = Math.max(50, this.slots[0] + this.windowMs - Date.now() + 25)
        const sleepUntil = Math.min(waitMs, head.deadline - Date.now())
        if (sleepUntil <= 0) continue
        await new Promise((r) => setTimeout(r, sleepUntil))
      }
    } finally {
      this.processing = false
    }
  }
}
