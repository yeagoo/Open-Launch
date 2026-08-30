/**
 * Single-process sliding-window limiter with a FIFO wait queue.
 *
 * This is an outbound provider throttle, not an inbound abuse-control or
 * distributed limiter. Callers that need cross-replica enforcement must use
 * the Redis-backed helpers in `rate-limit.ts`.
 */
export class SlidingWindowQueueLimiter {
  private readonly slots: number[] = []
  private readonly queue: Array<{
    resolve: () => void
    reject: (error: Error) => void
    deadline: number
  }> = []
  private processing = false

  constructor(
    private readonly maxPerWindow: number,
    private readonly windowMs: number,
  ) {
    if (maxPerWindow <= 0 || windowMs <= 0) {
      throw new Error("SlidingWindowQueueLimiter requires positive maxPerWindow and windowMs")
    }
  }

  /** Block until the caller can proceed, or reject after the bounded wait. */
  async acquire(timeoutMs: number = 5 * 60_000): Promise<void> {
    return new Promise((resolve, reject) => {
      this.queue.push({ resolve, reject, deadline: Date.now() + timeoutMs })
      void this.processQueue()
    })
  }

  get queueDepth(): number {
    return this.queue.length
  }

  slotsInWindow(): number {
    this.evictExpired()
    return this.slots.length
  }

  private evictExpired(): void {
    const cutoff = Date.now() - this.windowMs
    while (this.slots.length > 0) {
      const oldestSlot = this.slots[0]
      if (oldestSlot === undefined || oldestSlot > cutoff) return
      this.slots.shift()
    }
  }

  private async processQueue(): Promise<void> {
    if (this.processing) return
    this.processing = true
    try {
      while (this.queue.length > 0) {
        const head = this.queue[0]
        if (!head) continue

        if (Date.now() > head.deadline) {
          this.queue.shift()
          head.reject(
            new Error(
              `SlidingWindowQueueLimiter: queued ${this.maxPerWindow}/${this.windowMs}ms call timed out (queue depth was ${this.queue.length + 1})`,
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

        const oldestSlot = this.slots[0]
        if (oldestSlot === undefined) continue
        const waitMs = Math.max(50, oldestSlot + this.windowMs - Date.now() + 25)
        const sleepUntil = Math.min(waitMs, head.deadline - Date.now())
        if (sleepUntil <= 0) continue
        await new Promise((resolve) => setTimeout(resolve, sleepUntil))
      }
    } finally {
      this.processing = false
    }
  }
}
