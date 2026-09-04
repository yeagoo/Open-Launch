import { describe, expect, it } from "vitest"

import { cronTaskHttpError } from "./cron-dispatch-result"

describe("cron task HTTP error summaries", () => {
  it("does not create an error for successful responses", () => {
    expect(cronTaskHttpError(200, '{"ok":true}')).toBeUndefined()
  })

  it("extracts route errors and applies persistent-log redaction", () => {
    const summary = cronTaskHttpError(
      500,
      JSON.stringify({
        errors: [
          "project-1: upstream timed out",
          "Bearer secret-token",
          "postgres://user:password@db.internal/app",
          "ignored fourth error",
        ],
      }),
    )

    expect(summary).toContain("cron route returned HTTP 500")
    expect(summary).toContain("project-1: upstream timed out")
    expect(summary).not.toContain("secret-token")
    expect(summary).not.toContain("user:password")
    expect(summary).not.toContain("ignored fourth error")
  })

  it("records an empty non-success response without inventing details", () => {
    expect(cronTaskHttpError(503, "")).toBe("cron route returned HTTP 503")
  })
})
