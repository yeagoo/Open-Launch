import { describe, expect, it } from "vitest"

import { communityIdPattern, isCommunityId } from "./id"
import { idSchema } from "./validation"

describe("community identifier format", () => {
  it("keeps the lightweight Proxy guard aligned with service validation", () => {
    for (const [value, expected] of [
      ["00000000-0000-0000-0000-000000000000", true],
      ["550E8400-E29B-41D4-A716-446655440000", true],
      ["018f2e71-6d3e-7b1a-ae19-c7de1a8f2caa", true],
      ["not-a-uuid", false],
      ["550e8400-e29b-41d4-a716-446655440000/extra", false],
    ] as const) {
      expect(communityIdPattern.test(value)).toBe(expected)
      expect(isCommunityId(value)).toBe(expected)
      expect(idSchema.safeParse(value).success).toBe(expected)
    }
  })
})
