import { describe, expect, it } from "vitest"

import { crawlFailurePolicy } from "./crawl-health"

const NOW = new Date("2026-07-15T00:00:00.000Z")

describe("crawlFailurePolicy", () => {
  it("quarantines missing pages for 30 days", () => {
    const policy = crawlFailurePolicy("Tinyfish per-URL error: page_not_found", NOW)
    expect(policy.kind).toBe("permanent")
    expect(policy.shouldSuspendProject).toBe(true)
    if (!policy.shouldSuspendProject) throw new Error("expected project suspension")
    expect(policy.suspendedUntil.toISOString()).toBe("2026-08-14T00:00:00.000Z")
  })

  it("rechecks target HTTP failures after a week", () => {
    const policy = crawlFailurePolicy("Tinyfish per-URL error: target_http_error", NOW)
    expect(policy.kind).toBe("degraded")
    if (!policy.shouldSuspendProject) throw new Error("expected project suspension")
    expect(policy.suspendedUntil.toISOString()).toBe("2026-07-22T00:00:00.000Z")
  })

  it("retries proxy and timeout failures after one hour", () => {
    for (const message of [
      "proxy_error",
      "target_unreachable",
      "HeadersTimeoutError: Headers Timeout Error",
    ]) {
      const policy = crawlFailurePolicy(message, NOW)
      expect(policy.kind).toBe("transient")
      if (!policy.shouldSuspendProject) throw new Error("expected project suspension")
      expect(policy.suspendedUntil.toISOString()).toBe("2026-07-15T01:00:00.000Z")
    }
  })

  it("does not quarantine projects for provider-wide configuration or quota failures", () => {
    for (const message of [
      "TINYFISH_API_KEY environment variable is not set",
      "Tinyfish 401: API key invalid or revoked",
      "Tinyfish 429: rate limit exceeded (25 URLs/min cap)",
    ]) {
      expect(crawlFailurePolicy(message, NOW)).toEqual({
        kind: "provider",
        shouldSuspendProject: false,
      })
    }
  })
})
