import { describe, expect, it } from "vitest"

import {
  buildReportOnlyContentSecurityPolicy,
  parseCspViolationReport,
} from "./content-security-policy"

describe("report-only content security policy", () => {
  it("contains the staged safety directives and known browser providers", () => {
    const policy = buildReportOnlyContentSecurityPolicy()

    expect(policy).toContain("default-src 'self'")
    expect(policy).toContain("object-src 'none'")
    expect(policy).toContain("frame-ancestors 'self'")
    expect(policy).toContain("https://challenges.cloudflare.com")
    expect(policy).toContain("https://static.cloudflareinsights.com")
    expect(policy).toContain("https://cloudflareinsights.com")
    expect(policy).toContain("https://accounts.google.com")
    expect(policy).toContain("report-uri /api/csp-report")
    expect(policy).not.toContain("unsafe-eval")
  })

  it("drops query strings and reduces blocked URLs to origins", () => {
    expect(
      parseCspViolationReport({
        "csp-report": {
          "document-uri": "https://www.aat.ee/en/projects/private-slug?token=secret#fragment",
          "blocked-uri": "https://evil.example/collect?email=person@example.com",
          "effective-directive": "script-src-elem",
          "violated-directive": "script-src-elem https://allowed.example",
          disposition: "report",
          "status-code": 200,
          "script-sample": "secret source must not survive",
        },
      }),
    ).toEqual({
      documentPath: "/en/projects/private-slug",
      blockedHost: "evil.example",
      effectiveDirective: "script-src-elem",
      violatedDirective: "script-src-elem",
      disposition: "report",
      statusCode: 200,
    })
  })

  it("rejects malformed reports", () => {
    expect(parseCspViolationReport(null)).toBeNull()
    expect(parseCspViolationReport({ "csp-report": { "document-uri": "not a URL" } })).toBeNull()
  })
})
