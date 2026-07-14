import { describe, expect, it } from "vitest"

import { redactEmail } from "./log-redaction"

describe("redactEmail", () => {
  it("keeps only two local-part characters and the provider domain", () => {
    expect(redactEmail("bluehuman@inboxpad.com")).toBe("bl***@inboxpad.com")
  })

  it("handles one-character local parts", () => {
    expect(redactEmail("a@example.com")).toBe("a***@example.com")
  })

  it("does not echo malformed input", () => {
    expect(redactEmail("not-an-email")).toBe("[redacted-email]")
    expect(redactEmail("@example.com")).toBe("[redacted-email]")
  })
})
