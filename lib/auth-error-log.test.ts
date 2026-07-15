import { describe, expect, it } from "vitest"

import { buildBetterAuthApiErrorLog } from "@/lib/auth-error-log"

describe("buildBetterAuthApiErrorLog", () => {
  it("keeps actionable stack frames while redacting OAuth secrets", () => {
    const error = new TypeError(
      "exchange failed for alice@example.com code=abc123 access_token=token-value Bearer bearer-value",
    )
    error.stack = `${error.name}: ${error.message}\n    at callback (https://aat.ee/api/auth/callback?state=secret-state)`

    const log = buildBetterAuthApiErrorLog(error, new Date("2026-07-10T00:00:00Z"))
    const serialized = JSON.stringify(log)

    expect(log.source).toBe("better_auth_api_error")
    expect(log.error.stack).toHaveLength(1)
    expect(serialized).toContain("[redacted]")
    expect(serialized).not.toContain("abc123")
    expect(serialized).not.toContain("token-value")
    expect(serialized).not.toContain("bearer-value")
    expect(serialized).not.toContain("secret-state")
    expect(serialized).not.toContain("alice@example.com")
    expect(serialized).toContain("al***@example.com")
  })
})
