import { describe, expect, it } from "vitest"

import { skillPublicationIdempotencyKey } from "./skill-takedown"

describe("skillPublicationIdempotencyKey", () => {
  it("is stable per submission and site", () => {
    expect(skillPublicationIdempotencyKey("sub-1", "bigkr")).toBe("skill:sub-1:bigkr")
  })
})
