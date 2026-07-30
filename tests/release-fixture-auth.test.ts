import { signedSessionCookie } from "@/e2e/helpers/release-fixture"
import { describe, expect, it } from "vitest"

describe("release fixture session cookie", () => {
  it("matches Better Auth's URL-encoded padded base64 HMAC format", () => {
    expect(
      signedSessionCookie("open-launch-e2e-session-token", "open-launch-e2e-auth-secret-32-bytes"),
    ).toBe("open-launch-e2e-session-token.BFk8tLMTcwpMJXTNLnSY%2B%2BORIMCI7Myo7nhWKQB5pos%3D")
  })

  it("refuses a non-fixture secret", () => {
    expect(() => signedSessionCookie("token", "production-shaped-secret")).toThrow(
      /must start with open-launch-e2e-/,
    )
  })
})
