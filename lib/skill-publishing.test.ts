import { afterEach, describe, expect, it, vi } from "vitest"

import {
  buildSkillLaunchPayload,
  buildSkillLaunchRequestBody,
  buildSkillUnpublishRequestBody,
  extractSkillPostExternalFields,
  skillSiteApiKey,
  skillSiteEndpoint,
  skillSiteUnpublishEndpoint,
} from "./skill-publishing"

describe("skill publishing configuration", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("builds nofollow free-skill launch payloads", () => {
    const payload = buildSkillLaunchPayload({
      title: "Acme Metrics",
      tagline: "Analytics for founders",
      bodyMd: "A useful analytics product.",
      websiteUrl: "https://example.com",
    })

    expect(payload).toEqual({
      source: "aat.ee",
      name: "Acme Metrics",
      tagline: "Analytics for founders",
      description: "A useful analytics product.",
      websiteUrl: "https://example.com",
      rel: "nofollow",
      tier: "free-skill",
    })

    expect(buildSkillLaunchRequestBody("qoo-im", "skill:sub-1:qoo-im", payload)).toEqual({
      source: "aat.ee",
      idempotencyKey: "skill:sub-1:qoo-im",
      targetSiteId: "qoo-im",
      name: "Acme Metrics",
      tagline: "Analytics for founders",
      description: "A useful analytics product.",
      websiteUrl: "https://example.com",
      rel: "nofollow",
      tier: "free-skill",
    })
  })

  it("builds unpublish payloads with the idempotency key and website URL fallback", () => {
    expect(
      buildSkillUnpublishRequestBody({
        site: "qoo-im",
        idempotencyKey: "skill:sub-1:qoo-im",
        websiteUrl: "https://example.com",
      }),
    ).toEqual({
      source: "aat.ee",
      idempotencyKey: "skill:sub-1:qoo-im",
      targetSiteId: "qoo-im",
      websiteUrl: "https://example.com",
    })
  })

  it("extracts external fields from direct and gateway receiver responses", () => {
    expect(
      extractSkillPostExternalFields({ id: 123, url: "https://bigkr.com/product/acme" }),
    ).toEqual({
      externalId: "123",
      externalUrl: "https://bigkr.com/product/acme",
    })

    expect(
      extractSkillPostExternalFields({
        sites: [{ id: "tool_1", url: "https://qoo.im/tools/acme" }],
      }),
    ).toEqual({
      externalId: "tool_1",
      externalUrl: "https://qoo.im/tools/acme",
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
