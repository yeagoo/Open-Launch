import { afterEach, describe, expect, it, vi } from "vitest"

import { logStructured } from "./structured-logger"

describe("structured logger output", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env.PHASE3_TEST_API_KEY
  })

  it("removes configured secret environment values before writing one JSON line", () => {
    process.env.PHASE3_TEST_API_KEY = "opaque-provider-credential-123"
    const write = vi.spyOn(console, "error").mockImplementation(() => {})

    logStructured("error", "provider_failed", {
      provider: "test",
      context: { detail: "provider rejected opaque-provider-credential-123" },
    })

    expect(write).toHaveBeenCalledOnce()
    const output = String(write.mock.calls[0]?.[0])
    expect(() => JSON.parse(output)).not.toThrow()
    expect(output).not.toContain("opaque-provider-credential-123")
    expect(output).toContain("[redacted-env]")
  })
})
