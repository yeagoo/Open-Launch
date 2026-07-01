import { randomUUID } from "node:crypto"

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

function inMemoryCheck(
  key: string,
  limit: number,
  windowMs: number,
  now: number,
  consume: boolean,
): RateLimitResult {
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

  if (consume) hits.push(now)
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
  /**
   * Whether a successful check consumes one slot. Set false for a preflight
   * before expensive work, then call again with the default before the capped
   * side effect.
   */
  consume?: boolean
}

const RATE_LIMIT_LUA = `
redis.call("ZREMRANGEBYSCORE", KEYS[1], 0, ARGV[1])

local limit = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local window_ms = tonumber(ARGV[4])
local member = ARGV[5]
local expire_seconds = tonumber(ARGV[6])
local consume = ARGV[7] == "1"
local count = redis.call("ZCARD", KEYS[1])

if count >= limit then
  local oldest = redis.call("ZRANGE", KEYS[1], 0, 0, "WITHSCORES")
  local reset_at = oldest[2] and tonumber(oldest[2]) + window_ms or now + window_ms
  return {0, 0, math.ceil((reset_at - now) / 1000)}
end

if consume then
  redis.call("ZADD", KEYS[1], now, member)
  redis.call("EXPIRE", KEYS[1], expire_seconds)
  return {1, limit - count - 1, math.ceil(window_ms / 1000)}
end

return {1, limit - count, math.ceil(window_ms / 1000)}
`

/**
 * Fixed-window byte budget (Redis INCRBY + TTL). Unlike
 * `checkRateLimit` this meters a quantity, not a count — use it to
 * cap cumulative upload volume per user. Rejected attempts still
 * consume budget (conservative: keeps a prober blocked instead of
 * letting them feel out the remaining headroom). Fail-closed on
 * Redis errors: byte budgets guard expensive resources by nature.
 */
export async function checkByteBudget(
  identifier: string,
  bytes: number,
  budgetBytes: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const key = `byte-budget:${identifier}`
  const windowSeconds = Math.ceil(windowMs / 1000)
  try {
    const client = getRedisClient()
    if (client.status !== "ready") {
      await client.connect()
    }
    const total = await client.incrby(key, bytes)
    if (total === bytes) {
      await client.expire(key, windowSeconds)
    }
    if (total > budgetBytes) {
      const ttl = await client.ttl(key)
      return { success: false, remaining: 0, reset: ttl > 0 ? ttl : windowSeconds }
    }
    return { success: true, remaining: budgetBytes - total, reset: windowSeconds }
  } catch (error) {
    console.error("Redis error (checkByteBudget):", error)
    return { success: false, remaining: 0, reset: windowSeconds }
  }
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

/**
 * Release a `dedupeOnce` lease early so a subsequent call with the same
 * key can re-acquire it. Use when the work guarded by the lease FAILED
 * and should be retryable (e.g. a cron dispatch that errored) — without
 * this the key sits until its TTL and suppresses the retry. Best-effort:
 * a Redis hiccup just leaves the key to expire on its own.
 */
export async function clearDedupe(key: string): Promise<void> {
  const fullKey = `dedupe:${key}`
  inMemorySeen.delete(fullKey)
  try {
    const client = getRedisClient()
    if (client.status !== "ready") {
      await client.connect()
    }
    await client.del(fullKey)
  } catch (error) {
    console.error("Redis error (clearDedupe):", error)
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
  const consume = options.consume ?? true

  try {
    const client = getRedisClient()

    if (client.status !== "ready") {
      await client.connect()
    }

    const result = (await client.eval(
      RATE_LIMIT_LUA,
      1,
      key,
      String(windowStart),
      String(limit),
      String(now),
      String(window),
      `${now}:${randomUUID()}`,
      String(Math.ceil(window / 1000)),
      consume ? "1" : "0",
    )) as [number | string, number | string, number | string]

    return {
      success: Number(result[0]) === 1,
      remaining: Number(result[1]),
      reset: Number(result[2]),
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
    return inMemoryCheck(key, limit, window, now, consume)
  }
}
