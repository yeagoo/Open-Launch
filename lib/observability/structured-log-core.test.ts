import { describe, expect, it } from "vitest"

import { buildStructuredLog, sanitizeLogContext } from "./structured-log-core"

describe("structured log redaction", () => {
  it("keeps only allowlisted top-level fields and redacts nested secrets", () => {
    const error = new Error(
      "request https://example.com/reset?token=abc failed for alice@example.com Bearer xyz",
      {
        cause: new Error("cause password=hunter2"),
      },
    )
    Object.assign(error, { code: "UND_ERR_HEADERS_TIMEOUT" })

    const log = buildStructuredLog(
      "error",
      "request_failed",
      {
        requestId: "request-1\nforged",
        route: "https://www.aat.ee/es/projects/private-slug?token=secret",
        status: 500,
        durationMs: 12.6,
        provider: "SAFE_FETCH",
        context: {
          headers: {
            authorization: "Bearer top-secret",
            cookie: "session=secret",
            "stripe-signature": "sig",
          },
          url: "https://example.com/private/path?api_key=secret",
          email: "person@example.com",
        },
        error,
      },
      new Date("2026-07-30T00:00:00Z"),
    )
    const serialized = JSON.stringify(log)

    expect(log).toMatchObject({
      timestamp: "2026-07-30T00:00:00.000Z",
      level: "error",
      event: "request_failed",
      request_id: "request-1 forged",
      route: "/projects/[param]",
      status: 500,
      duration_ms: 13,
      provider: "safe_fetch",
    })
    expect(serialized).not.toContain("top-secret")
    expect(serialized).not.toContain("session=secret")
    expect(serialized).not.toContain("private/path")
    expect(serialized).not.toContain("alice@example.com")
    expect(serialized).not.toContain("hunter2")
    expect(serialized).not.toContain('"cause"')
    expect(serialized).toContain("[redacted]")
    expect(serialized).toContain("[redacted-url]")
    expect(serialized).toContain("[redacted-email]")
  })

  it("bounds recursive context and rejects invalid event/provider values", () => {
    const log = buildStructuredLog("info", "bad event", {
      provider: "not allowed/provider",
      context: { level1: { level2: { level3: { value: "secret" } } } },
    })

    expect(log.event).toBe("invalid_event")
    expect(log.provider).toBeUndefined()
    expect(log.context).toEqual({
      level1: { level2: { level3: "[truncated]" } },
    })
  })

  it("redacts sensitive header keys independent of casing", () => {
    expect(
      sanitizeLogContext({
        Authorization: "Bearer secret",
        COOKIE: "session=secret",
        stripeSignature: "secret",
        setCookie: "secret",
        requestUrl: "/projects/private-slug?token=secret",
        searchParams: { q: "private search" },
        ordinary: "ok",
      }),
    ).toEqual({
      Authorization: "[redacted]",
      COOKIE: "[redacted]",
      stripeSignature: "[redacted]",
      setCookie: "[redacted]",
      requestUrl: "[redacted-url]",
      searchParams: "[redacted]",
      ordinary: "ok",
    })
  })
})
