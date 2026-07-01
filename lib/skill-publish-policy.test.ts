import { describe, expect, it } from "vitest"

import { skillPublishBackoffMinutes } from "./skill-publish-policy"

describe("skillPublishBackoffMinutes", () => {
  it("uses 2**attempts exponential backoff capped at 120 minutes", () => {
    expect(skillPublishBackoffMinutes(1)).toBe(2)
    expect(skillPublishBackoffMinutes(2)).toBe(4)
    expect(skillPublishBackoffMinutes(7)).toBe(120)
    expect(skillPublishBackoffMinutes(8)).toBe(120)
  })
})
