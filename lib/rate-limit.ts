import Redis from "ioredis"

// Lazy initialization: only create Redis client when actually needed
let redis: Redis | null = null

function getRedisClient(): Redis {
  if (!redis) {
    // Only create Redis connection at runtime, not during build
    redis = new Redis(process.env.REDIS_URL || "", {
      lazyConnect: true,
      retryStrategy: (times) => {
        // Stop retrying after 3 attempts
        if (times > 3) {
          return null
        }
        return Math.min(times * 100, 3000)
      },
      maxRetriesPerRequest: 3,
    })

    // Handle connection errors gracefully
    redis.on("error", (error) => {
      console.error("Redis connection error:", error.message)
    })
  }
  return redis
}

export async function checkRateLimit(
  identifier: string,
  limit: number,
  window: number,
): Promise<{
  success: boolean
  remaining: number
  reset: number
}> {
  const key = `rate-limit:${identifier}`
  const now = Date.now()
  const windowStart = now - window

  try {
    const client = getRedisClient()

    // Ensure connection is established
    if (client.status !== "ready") {
      await client.connect()
    }

    // Nettoyer les anciennes requêtes
    await client.zremrangebyscore(key, 0, windowStart)

    // Obtenir le nombre de requêtes dans la fenêtre actuelle
    const requestCount = await client.zcard(key)

    if (requestCount >= limit) {
      // Obtenir la requête la plus ancienne avec son score
      const oldestRequest = await client.zrange(key, 0, 0, "WITHSCORES")
      const reset = oldestRequest.length ? parseInt(oldestRequest[1]) + window : now + window

      return {
        success: false,
        remaining: 0,
        reset: Math.ceil((reset - now) / 1000), // Temps restant en secondes
      }
    }

    // Ajouter la nouvelle requête
    await client.zadd(key, now, now.toString())

    // Définir l'expiration de la clé
    await client.expire(key, Math.ceil(window / 1000))

    return {
      success: true,
      remaining: limit - requestCount - 1,
      reset: Math.ceil(window / 1000),
    }
  } catch (error) {
    console.error("Redis error:", error)
    // En cas d'erreur Redis, on laisse passer la requête
    return {
      success: true,
      remaining: 1,
      reset: 0,
    }
  }
}
