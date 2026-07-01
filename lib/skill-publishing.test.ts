import { afterEach, describe, expect, it, vi } from "vitest"

import {
  buildSkillLaunchPayload,
  skillSiteApiKey,
  skillSiteEndpoint,
  skillSiteUnpublishEndpoint,
} from "./skill-publishing"

describe("skill publishing configuration", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("builds nofollow free-skill launch payloads", () => {
    expect(
      buildSkillLaunchPayload({
        title: "Acme Metrics",
        tagline: "Analytics for founders",
        bodyMd: "A useful analytics product.",
        websiteUrl: "https://example.com",
      }),
    ).toEqual({
      source: "aat.ee",
      name: "Acme Metrics",
      tagline: "Analytics for founders",
      description: "A useful analytics product.",
      websiteUrl: "https://example.com",
      rel: "nofollow",
      tier: "free-skill",
    })
  })

  it("resolves per-site publish and unpublish endpoints", () => {
    vi.stubEnv("SKILL_PUBLISH_BIGKR_URL", "https://bigkr.com/api/external/launch")

    expect(skillSiteEndpoint("bigkr")).toBe("https://bigkr.com/api/external/launch")
    expect(skillSiteUnpublishEndpoint("bigkr")).toBe("https://bigkr.com/api/external/unpublish")
  })

  it("prefers per-site API keys and falls back to the shared skill key", () => {
    vi.stubEnv("SKILL_PUBLISH_API_KEY", "shared")
    vi.stubEnv("SKILL_PUBLISH_BIGKR_API_KEY", "site")

    expect(skillSiteApiKey("bigkr")).toBe("site")
    expect(skillSiteApiKey("mf8")).toBe("shared")
  })
})
