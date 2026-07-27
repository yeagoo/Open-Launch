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

/**
 * Shared Redis connection for infrastructure beyond the rate limiter
 * (better-auth secondaryStorage). Lazily connects on first command, so
 * importing it at build time is safe. Callers must still gate on
 * `process.env.REDIS_URL` being set — an empty URL yields a client that
 * never connects.
 */
export function getSharedRedisClient(): Redis {
  return getRedisClient()
}

export type RateLimitResult = {
  success: boolean
  remaining: number
  reset: number
}

export type RateLimitReservationResult =
  | (RateLimitResult & { success: true; token: string })
  | (RateLimitResult & { success: false; token?: undefined })

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

const RATE_LIMIT_RESERVATION_LUA = `
redis.call("ZREMRANGEBYSCORE", KEYS[1], 0, ARGV[1])

local limit = tonumber(ARGV[2])
local used = tonumber(ARGV[3])
local now = tonumber(ARGV[4])
local ttl_ms = tonumber(ARGV[5])
local token = ARGV[6]
local ttl_seconds = tonumber(ARGV[7])
local available = limit - used

if available <= 0 then
  return {0, 0, ttl_seconds, ""}
end

local count = redis.call("ZCARD", KEYS[1])

if count >= available then
  local oldest = redis.call("ZRANGE", KEYS[1], 0, 0, "WITHSCORES")
  local reset_at = oldest[2] and tonumber(oldest[2]) + ttl_ms or now + ttl_ms
  return {0, 0, math.max(1, math.ceil((reset_at - now) / 1000)), ""}
end

redis.call("ZADD", KEYS[1], now, token)
redis.call("EXPIRE", KEYS[1], ttl_seconds)
return {1, available - count - 1, ttl_seconds, token}
`

const STATEFUL_ALERT_LUA = `
local fingerprint = redis.call("HGET", KEYS[1], "fingerprint")
local incident_anchor = redis.call("HGET", KEYS[1], "incident_anchor")
local last_sent = tonumber(redis.call("HGET", KEYS[1], "last_sent") or "0")
local next_fingerprint = ARGV[1]
local next_incident_anchor = ARGV[2]
local now = tonumber(ARGV[3])
local reminder_seconds = tonumber(ARGV[4])
local retention_seconds = tonumber(ARGV[5])

if not fingerprint then
  redis.call("HSET", KEYS[1], "fingerprint", next_fingerprint, "incident_anchor", next_incident_anchor, "last_sent", now)
  redis.call("EXPIRE", KEYS[1], retention_seconds)
  return 1
end

if fingerprint ~= next_fingerprint then
  redis.call("HSET", KEYS[1], "fingerprint", next_fingerprint, "incident_anchor", next_incident_anchor, "last_sent", now)
  redis.call("EXPIRE", KEYS[1], retention_seconds)
  return 2
end

-- Adopt an anchor for state written by the previous implementation without
-- creating a rollout alert. Future occurrences can then be distinguished.
if not incident_anchor then
  redis.call("HSET", KEYS[1], "incident_anchor", next_incident_anchor)
elseif incident_anchor ~= next_incident_anchor then
  redis.call("HSET", KEYS[1], "incident_anchor", next_incident_anchor, "last_sent", now)
  redis.call("EXPIRE", KEYS[1], retention_seconds)
  return 2
end

if now - last_sent >= reminder_seconds then
  redis.call("HSET", KEYS[1], "last_sent", now)
  redis.call("EXPIRE", KEYS[1], retention_seconds)
  return 3
end

redis.call("EXPIRE", KEYS[1], retention_seconds)
return 0
`

const RELEASE_STATEFUL_ALERT_LUA = `
local fingerprint = redis.call("HGET", KEYS[1], "fingerprint")
local incident_anchor = redis.call("HGET", KEYS[1], "incident_anchor")

if fingerprint == ARGV[1] and incident_anchor == ARGV[2] then
  return redis.call("DEL", KEYS[1])
end

return 0
`

export type StatefulAlertDecision = {
  shouldSend: boolean
  reason: "new" | "changed" | "reminder" | "suppressed"
}

type InMemoryAlertState = {
  fingerprint: string
  incidentAnchor: string
  lastSentAt: number
}

const MAX_IN_MEMORY_ALERT_STATES = 1000
const inMemoryAlertStates = new Map<string, InMemoryAlertState>()

function rememberAlertState(key: string, state: InMemoryAlertState): void {
  inMemoryAlertStates.delete(key)
  inMemoryAlertStates.set(key, state)
  if (inMemoryAlertStates.size > MAX_IN_MEMORY_ALERT_STATES) {
    const oldest = inMemoryAlertStates.keys().next().value
    if (oldest !== undefined) inMemoryAlertStates.delete(oldest)
  }
}

function decideInMemoryStatefulAlert(
  key: string,
  fingerprint: string,
  incidentAnchor: string,
  reminderSeconds: number,
  now: number,
): StatefulAlertDecision {
  const existing = inMemoryAlertStates.get(key)
  if (!existing) {
    rememberAlertState(key, { fingerprint, incidentAnchor, lastSentAt: now })
    return { shouldSend: true, reason: "new" }
  }
  if (existing.fingerprint !== fingerprint || existing.incidentAnchor !== incidentAnchor) {
    rememberAlertState(key, { fingerprint, incidentAnchor, lastSentAt: now })
    return { shouldSend: true, reason: "changed" }
  }
  if (now - existing.lastSentAt >= reminderSeconds * 1000) {
    rememberAlertState(key, { fingerprint, incidentAnchor, lastSentAt: now })
    return { shouldSend: true, reason: "reminder" }
  }
  rememberAlertState(key, existing)
  return { shouldSend: false, reason: "suppressed" }
}

/**
 * Atomically decide whether an alert should be sent for the current state.
 * A new fingerprint or incident anchor sends immediately; an unchanged state
 * sends only after `reminderSeconds`. Redis keeps the decision shared across
 * app instances, with a bounded per-process fallback when Redis is unavailable.
 */
export async function decideStatefulAlert(
  key: string,
  fingerprint: string,
  incidentAnchor: string,
  reminderSeconds: number,
): Promise<StatefulAlertDecision> {
  if (!Number.isFinite(reminderSeconds) || reminderSeconds <= 0) {
    throw new RangeError("reminderSeconds must be a finite positive number")
  }
  const fullKey = `alert-state:${key}`
  const boundedReminderSeconds = Math.max(1, Math.ceil(reminderSeconds))
  const retentionSeconds = Math.max(24 * 3600, boundedReminderSeconds * 4)
  const now = Date.now()
  try {
    const client = getRedisClient()
    if (client.status !== "ready") {
      await client.connect()
    }
    const code = Number(
      await client.eval(
        STATEFUL_ALERT_LUA,
        1,
        fullKey,
        fingerprint,
        incidentAnchor,
        String(Math.floor(now / 1000)),
        String(boundedReminderSeconds),
        String(retentionSeconds),
      ),
    )
    if (code === 1) return { shouldSend: true, reason: "new" }
    if (code === 2) return { shouldSend: true, reason: "changed" }
    if (code === 3) return { shouldSend: true, reason: "reminder" }
    if (code === 0) return { shouldSend: false, reason: "suppressed" }
    throw new Error(`unexpected stateful alert decision code: ${code}`)
  } catch (error) {
    console.error("Redis error (decideStatefulAlert):", error)
    return decideInMemoryStatefulAlert(
      fullKey,
      fingerprint,
      incidentAnchor,
      boundedReminderSeconds,
      now,
    )
  }
}

/**
 * Clear alert state after recovery. Returns false if shared Redis state could
 * not be cleared; the incident anchor still makes a later recurrence distinct.
 */
export async function clearStatefulAlert(key: string): Promise<boolean> {
  const fullKey = `alert-state:${key}`
  inMemoryAlertStates.delete(fullKey)
  try {
    const client = getRedisClient()
    if (client.status !== "ready") {
      await client.connect()
    }
    await client.del(fullKey)
    return true
  } catch (error) {
    console.error("Redis error (clearStatefulAlert):", error)
    return false
  }
}

/**
 * Release a claimed alert after notification failure, but only when the state
 * still represents that exact incident. This prevents an older request from
 * deleting a newer concurrently-recorded incident.
 */
export async function releaseStatefulAlert(
  key: string,
  fingerprint: string,
  incidentAnchor: string,
): Promise<boolean> {
  const fullKey = `alert-state:${key}`
  const fallbackState = inMemoryAlertStates.get(fullKey)
  if (
    fallbackState?.fingerprint === fingerprint &&
    fallbackState.incidentAnchor === incidentAnchor
  ) {
    inMemoryAlertStates.delete(fullKey)
  }

  try {
    const client = getRedisClient()
    if (client.status !== "ready") {
      await client.connect()
    }
    return (
      Number(
        await client.eval(RELEASE_STATEFUL_ALERT_LUA, 1, fullKey, fingerprint, incidentAnchor),
      ) === 1
    )
  } catch (error) {
    console.error("Redis error (releaseStatefulAlert):", error)
    return false
  }
}

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

export async function reserveRateLimitSlot(
  identifier: string,
  limit: number,
  used: number,
  ttlMs: number,
): Promise<RateLimitReservationResult> {
  const key = `rate-limit-reservation:${identifier}`
  const now = Date.now()
  const ttlSeconds = Math.ceil(ttlMs / 1000)
  const token = `${now}:${randomUUID()}`

  try {
    const client = getRedisClient()

    if (client.status !== "ready") {
      await client.connect()
    }

    const result = (await client.eval(
      RATE_LIMIT_RESERVATION_LUA,
      1,
      key,
      String(now - ttlMs),
      String(limit),
      String(Math.max(0, used)),
      String(now),
      String(ttlMs),
      token,
      String(ttlSeconds),
    )) as [number | string, number | string, number | string, string | null | undefined]

    const success = Number(result[0]) === 1
    const reservedToken = typeof result[3] === "string" && result[3] ? result[3] : undefined
    if (!success || !reservedToken) {
      return {
        success: false,
        remaining: Number(result[1]),
        reset: Number(result[2]),
      }
    }

    return {
      success: true,
      remaining: Number(result[1]),
      reset: Number(result[2]),
      token: reservedToken,
    }
  } catch (error) {
    console.error("Redis error (reserveRateLimitSlot):", error)
    return {
      success: false,
      remaining: 0,
      reset: ttlSeconds,
    }
  }
}

export async function releaseRateLimitSlot(identifier: string, token: string): Promise<void> {
  const key = `rate-limit-reservation:${identifier}`
  try {
    const client = getRedisClient()

    if (client.status !== "ready") {
      await client.connect()
    }

    await client.zrem(key, token)
  } catch (error) {
    console.error("Redis error (releaseRateLimitSlot):", error)
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
