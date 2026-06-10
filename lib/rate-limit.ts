import Redis from "ioredis"

let redis: Redis | null = null

function getRedisClient(): Redis {
  if (!redis) {
    redis = new Redis(process.env.REDIS_URL || "", {
      lazyConnect: true,
      retryStrategy: (times) => {
        if (times > 3) return null
        return Math.min(times * 100, 3000)
      },
      maxRetriesPerRequest: 3,
    })

    redis.on("error", (error) => {
      console.error("Redis connection error:", error.message)
    })
  }
  return redis
}

export type RateLimitResult = {
  success: boolean
  remaining: number
  reset: number
}

// In-memory sliding-window fallback. Used when Redis is unreachable so
// we don't fail-open on abuse. Bounded by `MAX_IN_MEMORY_KEYS` so a
// flood of unique identifiers (e.g. one per user id) can't OOM the
// process — oldest keys evicted via insertion-order Map iteration.
const MAX_IN_MEMORY_KEYS = 5000
const inMemoryHits = new Map<string, number[]>()

function inMemoryCheck(key: string, limit: number, windowMs: number, now: number): RateLimitResult {
  let hits = inMemoryHits.get(key)
  if (!hits) {
    if (inMemoryHits.size >= MAX_IN_MEMORY_KEYS) {
      // Evict the oldest inserted key.
      const oldest = inMemoryHits.keys().next().value
      if (oldest !== undefined) inMemoryHits.delete(oldest)
    }
    hits = []
    inMemoryHits.set(key, hits)
  } else {
    inMemoryHits.delete(key)
    inMemoryHits.set(key, hits)
  }

  const windowStart = now - windowMs
  while (hits.length > 0 && hits[0] <= windowStart) hits.shift()

  if (hits.length >= limit) {
    const reset = Math.ceil((hits[0] + windowMs - now) / 1000)
    return { success: false, remaining: 0, reset }
  }

  hits.push(now)
  return {
    success: true,
    remaining: limit - hits.length,
    reset: Math.ceil(windowMs / 1000),
  }
}

export type RateLimitOptions = {
  /**
   * What to do when Redis is unreachable.
   *   - "memory-fallback" (default): apply an in-memory per-process
   *     sliding window so abuse is still bounded.
   *   - "fail-closed": deny the request. Use for expensive endpoints
   *     (file upload, external HTTP fetches, AI calls) where letting
   *     unlimited traffic through is worse than dropping it.
   */
  onRedisError?: "memory-fallback" | "fail-closed"
}

// In-memory fallback for `dedupeOnce` when Redis is unreachable —
// per-process only, same trade-off as the rate-limit fallback above.
const MAX_DEDUPE_KEYS = 1000
const inMemorySeen = new Map<string, number>()

/**
 * Returns true exactly once per `key` within `ttlSeconds` (Redis
 * `SET NX EX`), shared across instances and restarts. Use to suppress
 * duplicate side effects (alert emails, notifications) on retried
 * events. Falls back to a per-process map if Redis is down.
 */
export async function dedupeOnce(key: string, ttlSeconds: number): Promise<boolean> {
  const fullKey = `dedupe:${key}`
  try {
    const client = getRedisClient()
    if (client.status !== "ready") {
      await client.connect()
    }
    const result = await client.set(fullKey, "1", "EX", ttlSeconds, "NX")
    return result === "OK"
  } catch (error) {
    console.error("Redis error (dedupeOnce):", error)
    const now = Date.now()
    const seen = inMemorySeen.get(fullKey)
    if (seen !== undefined && now - seen < ttlSeconds * 1000) {
      return false
    }
    inMemorySeen.set(fullKey, now)
    if (inMemorySeen.size > MAX_DEDUPE_KEYS) {
      const oldest = inMemorySeen.keys().next().value
      if (oldest !== undefined) inMemorySeen.delete(oldest)
    }
    return true
  }
}

export async function checkRateLimit(
  identifier: string,
  limit: number,
  window: number,
  options: RateLimitOptions = {},
): Promise<RateLimitResult> {
  const key = `rate-limit:${identifier}`
  const now = Date.now()
  const windowStart = now - window

  try {
    const client = getRedisClient()

    if (client.status !== "ready") {
      await client.connect()
    }

    await client.zremrangebyscore(key, 0, windowStart)
    const requestCount = await client.zcard(key)

    if (requestCount >= limit) {
      const oldestRequest = await client.zrange(key, 0, 0, "WITHSCORES")
      const reset = oldestRequest.length ? parseInt(oldestRequest[1]) + window : now + window

      return {
        success: false,
        remaining: 0,
        reset: Math.ceil((reset - now) / 1000),
      }
    }

    await client.zadd(key, now, now.toString())
    await client.expire(key, Math.ceil(window / 1000))

    return {
      success: true,
      remaining: limit - requestCount - 1,
      reset: Math.ceil(window / 1000),
    }
  } catch (error) {
    console.error("Redis error:", error)
    const mode = options.onRedisError ?? "memory-fallback"
    if (mode === "fail-closed") {
      return {
        success: false,
        remaining: 0,
        reset: Math.ceil(window / 1000),
      }
    }
    return inMemoryCheck(key, limit, window, now)
  }
}
