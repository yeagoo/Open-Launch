import { describe, expect, it } from "vitest"

import { stagingReadOnlyDecision } from "./staging-read-only"

describe("stagingReadOnlyDecision", () => {
  it("does nothing when staging read-only mode is disabled", () => {
    expect(stagingReadOnlyDecision(false, "POST", "/api/payment/webhook")).toBeNull()
  })

  it.each(["POST", "PUT", "PATCH", "DELETE", "OPTIONS"])(
    "blocks %s requests while enabled",
    (method) => {
      expect(stagingReadOnlyDecision(true, method, "/api/projects")).toEqual({
        status: 405,
        reason: "write_method",
      })
    },
  )

  it.each(["/api/auth", "/api/auth/callback/google", "/api/cron/db-backup", "/admin"])(
    "hides sensitive GET path %s while enabled",
    (pathname) => {
      expect(stagingReadOnlyDecision(true, "GET", pathname)).toEqual({
        status: 404,
        reason: "sensitive_path",
      })
    },
  )

  it.each(["/", "/today", "/yesterday", "/search", "/api/search"])(
    "allows read path %s while enabled",
    (pathname) => {
      expect(stagingReadOnlyDecision(true, "GET", pathname)).toBeNull()
    },
  )
})
