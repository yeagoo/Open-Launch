import { describe, expect, it } from "vitest"

import { POOL_SIZE, poolAvatarUrl } from "@/lib/avatar-pool"

describe("avatar pool URL contract", () => {
  it("keeps the pool size and URL stable until the avatar ADR is approved", () => {
    expect(POOL_SIZE).toBe(20_000)
    expect(poolAvatarUrl("user-123")).toMatch(/^\/avatars\/pool\/\d+\.svg$/)
    const slot = Number(poolAvatarUrl("user-123").match(/(\d+)\.svg$/)?.[1])
    expect(slot).toBeGreaterThanOrEqual(0)
    expect(slot).toBeLessThan(POOL_SIZE)
    expect(poolAvatarUrl("user-123")).toBe(poolAvatarUrl("user-123"))
  })
})
