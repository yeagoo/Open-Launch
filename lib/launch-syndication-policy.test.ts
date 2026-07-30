import { describe, expect, it } from "vitest"

import {
  findSyndicationConfigurationIssues,
  siteApiKey,
  siteEndpoint,
  SYNDICATION_SITES,
} from "./launch-syndication-policy"

function completeEnvironment(): Record<string, string> {
  return {
    EXTERNAL_LAUNCH_API_KEY: "shared-key",
    SYNDICATION_BIGKR_URL: "https://bigkr.example/api/external/launch",
    SYNDICATION_MF8_URL: "https://mf8.example/api/external/launch",
    SYNDICATION_HICYOU_URL: "https://hicyou.example/api/external/launch",
    SYNDICATION_TOOLSO_URL: "https://toolso.example/api/external/launch",
  }
}

describe("launch syndication policy", () => {
  it("accepts four HTTPS endpoints with the shared API key", () => {
    const environment = completeEnvironment()
    expect(findSyndicationConfigurationIssues(environment)).toEqual([])
    for (const site of SYNDICATION_SITES) {
      expect(siteEndpoint(site, environment)).toContain("/api/external/launch")
      expect(siteApiKey(site, environment)).toBe("shared-key")
    }
  })

  it("reports missing keys and unsafe endpoint shapes without exposing values", () => {
    const environment = completeEnvironment()
    delete environment.EXTERNAL_LAUNCH_API_KEY
    environment.SYNDICATION_MF8_URL = "http://user:password@mf8.example/other?secret=value"

    const issues = findSyndicationConfigurationIssues(environment)
    expect(issues).toContain(
      "mf8: endpoint must be a credential-free HTTPS /api/external/launch URL",
    )
    expect(issues).toHaveLength(5)
    expect(issues.join("\n")).not.toContain("password")
    expect(issues.join("\n")).not.toContain("secret=value")
  })
})
