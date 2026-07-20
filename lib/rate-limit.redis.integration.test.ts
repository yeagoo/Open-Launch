import { randomUUID } from "node:crypto"

import Redis from "ioredis"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { clearStatefulAlert, decideStatefulAlert, releaseStatefulAlert } from "./rate-limit"

// Opt-in because the assertions execute the production Lua against a real
// Redis server. Example: REDIS_INTEGRATION_URL=redis://127.0.0.1:6379 bun test.
const integrationUrl = process.env.REDIS_INTEGRATION_URL
const describeWithRedis = integrationUrl ? describe : describe.skip

describeWithRedis("stateful alert Redis integration", () => {
  let directClient: Redis
  const createdKeys = new Set<string>()
  const previousRedisUrl = process.env.REDIS_URL

  function testKey(label: string): string {
    const key = `integration-${label}-${randomUUID()}`
    createdKeys.add(`alert-state:${key}`)
    return key
  }

  beforeAll(async () => {
    process.env.REDIS_URL = integrationUrl
    directClient = new Redis(integrationUrl!, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    })
    await directClient.connect()
  })

  afterAll(async () => {
    if (createdKeys.size > 0) {
      await directClient.del(...createdKeys)
    }
    directClient.disconnect()
    if (previousRedisUrl === undefined) delete process.env.REDIS_URL
    else process.env.REDIS_URL = previousRedisUrl
  })

  it("executes new, suppressed, fingerprint-change, and anchor-change decisions", async () => {
    const key = testKey("decisions")

    await expect(decideStatefulAlert(key, "fingerprint-a", "incident-a", 3600)).resolves.toEqual({
      shouldSend: true,
      reason: "new",
    })
    await expect(decideStatefulAlert(key, "fingerprint-a", "incident-a", 3600)).resolves.toEqual({
      shouldSend: false,
      reason: "suppressed",
    })
    await expect(decideStatefulAlert(key, "fingerprint-b", "incident-b", 3600)).resolves.toEqual({
      shouldSend: true,
      reason: "changed",
    })
    await expect(decideStatefulAlert(key, "fingerprint-b", "incident-c", 3600)).resolves.toEqual({
      shouldSend: true,
      reason: "changed",
    })
  })

  it("adopts legacy state without sending a rollout alert", async () => {
    const key = testKey("legacy")
    const fullKey = `alert-state:${key}`
    await directClient.hset(
      fullKey,
      "fingerprint",
      "fingerprint-a",
      "last_sent",
      String(Math.floor(Date.now() / 1000)),
    )

    await expect(decideStatefulAlert(key, "fingerprint-a", "incident-a", 3600)).resolves.toEqual({
      shouldSend: false,
      reason: "suppressed",
    })
    await expect(directClient.hget(fullKey, "incident_anchor")).resolves.toBe("incident-a")
  })

  it("sends a reminder after the configured interval", async () => {
    const key = testKey("reminder")
    const fullKey = `alert-state:${key}`
    await directClient.hset(
      fullKey,
      "fingerprint",
      "fingerprint-a",
      "incident_anchor",
      "incident-a",
      "last_sent",
      String(Math.floor(Date.now() / 1000) - 10),
    )

    await expect(decideStatefulAlert(key, "fingerprint-a", "incident-a", 1)).resolves.toEqual({
      shouldSend: true,
      reason: "reminder",
    })
  })

  it("does not let an older failed send delete a newer incident", async () => {
    const key = testKey("conditional-release")
    const fullKey = `alert-state:${key}`
    await decideStatefulAlert(key, "fingerprint-old", "incident-old", 3600)
    await decideStatefulAlert(key, "fingerprint-new", "incident-new", 3600)

    await expect(releaseStatefulAlert(key, "fingerprint-old", "incident-old")).resolves.toBe(false)
    await expect(directClient.hmget(fullKey, "fingerprint", "incident_anchor")).resolves.toEqual([
      "fingerprint-new",
      "incident-new",
    ])
    await expect(releaseStatefulAlert(key, "fingerprint-new", "incident-new")).resolves.toBe(true)
    await expect(directClient.exists(fullKey)).resolves.toBe(0)
  })

  it("atomically allows only one sender for concurrent identical decisions", async () => {
    const key = testKey("concurrent")
    const decisions = await Promise.all(
      Array.from({ length: 12 }, () =>
        decideStatefulAlert(key, "fingerprint-a", "incident-a", 3600),
      ),
    )

    expect(decisions.filter((decision) => decision.shouldSend)).toHaveLength(1)
    expect(decisions.filter((decision) => decision.reason === "suppressed")).toHaveLength(11)
  })

  it("clears recovered shared state", async () => {
    const key = testKey("clear")
    const fullKey = `alert-state:${key}`
    await decideStatefulAlert(key, "fingerprint-a", "incident-a", 3600)

    await expect(clearStatefulAlert(key)).resolves.toBe(true)
    await expect(directClient.exists(fullKey)).resolves.toBe(0)
  })
})
