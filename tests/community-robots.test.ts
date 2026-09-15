import { describe, expect, it } from "vitest"

import robots from "@/app/robots"

describe("community robots policy", () => {
  it("keeps the canonical post editor out of crawler paths", () => {
    const policy = robots()
    const generalRule = Array.isArray(policy.rules) ? policy.rules[0] : policy.rules
    const disallow = generalRule?.disallow

    expect(disallow).toContain("/community/t/*/edit")
  })
})
