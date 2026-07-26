import { describe, expect, it } from "vitest"

import { isSafeProfileImageUrl } from "@/lib/user-profile-validation"

describe("isSafeProfileImageUrl", () => {
  it("accepts empty values and HTTP image URLs", () => {
    expect(isSafeProfileImageUrl(null)).toBe(true)
    expect(isSafeProfileImageUrl("https://cdn.example.com/avatar.avif")).toBe(true)
  })

  it("rejects inline, local, credentialed, and executable URLs", () => {
    expect(isSafeProfileImageUrl("data:image/png;base64,AAAA")).toBe(false)
    expect(isSafeProfileImageUrl("blob:https://www.aat.ee/id")).toBe(false)
    expect(isSafeProfileImageUrl("javascript:alert(1)")).toBe(false)
    expect(isSafeProfileImageUrl("/avatar.png")).toBe(false)
    expect(isSafeProfileImageUrl("https://user:password@cdn.example.com/avatar.png")).toBe(false)
  })
})
