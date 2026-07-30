import { describe, expect, it } from "vitest"

import { redactEmail, redactEmailsInText } from "./log-redaction"

describe("redactEmail", () => {
  it("does not preserve any email-local or provider information", () => {
    expect(redactEmail("bluehuman@inboxpad.com")).toBe("[redacted-email]")
  })

  it("handles one-character local parts", () => {
    expect(redactEmail("a@example.com")).toBe("[redacted-email]")
  })

  it("does not echo malformed input", () => {
    expect(redactEmail("not-an-email")).toBe("[redacted-email]")
    expect(redactEmail("@example.com")).toBe("[redacted-email]")
  })

  it("redacts every email embedded in diagnostic text", () => {
    expect(redactEmailsInText("account alice@example.com conflicts with bob@test.dev")).toBe(
      "account [redacted-email] conflicts with [redacted-email]",
    )
  })
})
