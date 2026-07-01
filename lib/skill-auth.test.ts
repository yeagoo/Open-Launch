import { describe, expect, it } from "vitest"

import {
  hashSkillApiKey,
  verifySkillApiKey,
  type SkillApiKeyRecord,
  type SkillApiKeyStore,
} from "./skill-auth"

const RAW_KEY = "aat_skill_test_123456789"

function requestWithAuth(authorization?: string): Request {
  return new Request("https://www.aat.ee/api/skill/domains", {
    headers: authorization ? { authorization } : undefined,
  })
}

function fakeStore(record: SkillApiKeyRecord | null, stampResult = true) {
  const findCalls: string[] = []
  const stampCalls: Array<{ id: string; usedAt: Date }> = []

  const store: SkillApiKeyStore = {
    async findByHash(keyHash) {
      findCalls.push(keyHash)
      return record?.keyHash === keyHash ? record : null
    },
    async markLastUsed(id, usedAt) {
      stampCalls.push({ id, usedAt })
      return stampResult
    },
  }

  return { store, findCalls, stampCalls }
}

describe("verifySkillApiKey", () => {
  it("accepts a valid bearer key, returns the account id, and stamps last-used", async () => {
    const keyHash = hashSkillApiKey(RAW_KEY)
    const { store, findCalls, stampCalls } = fakeStore({
      id: "key-1",
      accountId: "user-1",
      keyHash,
      revokedAt: null,
    })

    const result = await verifySkillApiKey(requestWithAuth(`Bearer ${RAW_KEY}`), store)

    expect(result).toEqual({ accountId: "user-1" })
    expect(findCalls).toEqual([keyHash])
    expect(stampCalls).toHaveLength(1)
    expect(stampCalls[0].id).toBe("key-1")
    expect(stampCalls[0].usedAt).toBeInstanceOf(Date)
  })

  it("rejects revoked keys without stamping last-used", async () => {
    const { store, stampCalls } = fakeStore({
      id: "key-1",
      accountId: "user-1",
      keyHash: hashSkillApiKey(RAW_KEY),
      revokedAt: new Date("2026-07-01T00:00:00Z"),
    })

    await expect(verifySkillApiKey(requestWithAuth(`Bearer ${RAW_KEY}`), store)).resolves.toBeNull()
    expect(stampCalls).toEqual([])
  })

  it("rejects missing authorization without touching the store", async () => {
    const { store, findCalls, stampCalls } = fakeStore(null)

    await expect(verifySkillApiKey(requestWithAuth(), store)).resolves.toBeNull()
    expect(findCalls).toEqual([])
    expect(stampCalls).toEqual([])
  })

  it("rejects malformed authorization without touching the store", async () => {
    const { store, findCalls, stampCalls } = fakeStore(null)

    await expect(
      verifySkillApiKey(requestWithAuth("Basic not-a-skill-key"), store),
    ).resolves.toBeNull()
    expect(findCalls).toEqual([])
    expect(stampCalls).toEqual([])
  })

  it("rejects when a concurrent revoke prevents the last-used stamp", async () => {
    const { store } = fakeStore(
      {
        id: "key-1",
        accountId: "user-1",
        keyHash: hashSkillApiKey(RAW_KEY),
        revokedAt: null,
      },
      false,
    )

    await expect(verifySkillApiKey(requestWithAuth(`Bearer ${RAW_KEY}`), store)).resolves.toBeNull()
  })
})
