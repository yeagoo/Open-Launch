import { afterEach, describe, expect, it, vi } from "vitest"

import {
  buildSkillLaunchPayload,
  buildSkillLaunchRequestBody,
  buildSkillUnpublishRequestBody,
  extractSkillPostExternalFields,
  isSuccessfulSkillPostResponse,
  skillSiteApiKey,
  skillSiteEndpoint,
  skillSiteLaunchConfigError,
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

  it("drops non-http external URLs from receiver responses", () => {
    expect(
      extractSkillPostExternalFields({
        id: 123,
        url: "javascript:alert(1)",
      }),
    ).toEqual({
      externalId: "123",
      externalUrl: undefined,
    })

    expect(
      isSuccessfulSkillPostResponse(
        200,
        { ok: true, url: "javascript:alert(1)" },
        { requireExternalUrl: true },
      ),
    ).toBe(false)
  })

  it("accepts direct and gateway receiver success responses without requiring ok:true", () => {
    expect(
      isSuccessfulSkillPostResponse(200, {
        id: 123,
        url: "https://bigkr.com/product/acme",
      }),
    ).toBe(true)
    expect(
      isSuccessfulSkillPostResponse(200, {
        sites: [{ id: "tool_1", url: "https://qoo.im/tools/acme" }],
      }),
    ).toBe(true)
    expect(isSuccessfulSkillPostResponse(200, { ok: true })).toBe(true)
    expect(isSuccessfulSkillPostResponse(200, { ok: true }, { requireExternalUrl: true })).toBe(
      false,
    )
    expect(
      isSuccessfulSkillPostResponse(
        200,
        { ok: true, url: "https://bigkr.com/product/acme" },
        { requireExternalUrl: true },
      ),
    ).toBe(true)
    expect(isSuccessfulSkillPostResponse(200, { ok: false })).toBe(false)
    expect(isSuccessfulSkillPostResponse(200, { id: 123 })).toBe(false)
    expect(isSuccessfulSkillPostResponse(200, {})).toBe(false)
    expect(
      isSuccessfulSkillPostResponse(500, {
        id: 123,
        url: "https://bigkr.com/product/acme",
      }),
    ).toBe(false)
  })

  it("resolves per-site publish and unpublish endpoints", () => {
    vi.stubEnv("SKILL_PUBLISH_BIGKR_URL", "https://bigkr.com/api/external/launch")

    expect(skillSiteEndpoint("bigkr")).toBe("https://bigkr.com/api/external/launch")
    expect(skillSiteUnpublishEndpoint("bigkr")).toBe("https://bigkr.com/api/external/unpublish")
  })

  it("detects local publish misconfiguration before spending global budget", () => {
    vi.stubEnv("EXTERNAL_LAUNCH_API_KEY", "")

    expect(skillSiteLaunchConfigError("bigkr")).toBe("SKILL_PUBLISH_BIGKR_URL not configured")

    vi.stubEnv("SKILL_PUBLISH_BIGKR_URL", "https://bigkr.com/api/external/launch")
    expect(skillSiteLaunchConfigError("bigkr")).toBe(
      "No API key for bigkr (set SKILL_PUBLISH_BIGKR_API_KEY, SKILL_PUBLISH_API_KEY, or EXTERNAL_LAUNCH_API_KEY)",
    )

    vi.stubEnv("SKILL_PUBLISH_API_KEY", "shared")
    expect(skillSiteLaunchConfigError("bigkr")).toBeNull()
  })

  it("prefers per-site API keys and falls back to the shared skill key", () => {
    vi.stubEnv("SKILL_PUBLISH_API_KEY", "shared")
    vi.stubEnv("SKILL_PUBLISH_BIGKR_API_KEY", "site")

    expect(skillSiteApiKey("bigkr")).toBe("site")
    expect(skillSiteApiKey("mf8")).toBe("shared")
  })
})
