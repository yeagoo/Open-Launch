import { afterEach, describe, expect, it, vi } from "vitest"

import {
  buildSkillLaunchPayload,
  buildSkillLaunchRequestBody,
  buildSkillUnpublishRequestBody,
  extractSkillPostExternalFields,
  isSuccessfulSkillPostResponse,
  redactSkillEndpointUrl,
  skillSiteApiKey,
  skillSiteEndpoint,
  skillSiteEnvName,
  skillSiteLaunchConfigError,
  skillSiteUnpublishEndpoint,
  validateSkillEndpointUrl,
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

    expect(buildSkillLaunchRequestBody("demo-site", "skill:sub-1:demo-site", payload)).toEqual({
      source: "aat.ee",
      idempotencyKey: "skill:sub-1:demo-site",
      targetSiteId: "demo-site",
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
        site: "demo-site",
        idempotencyKey: "skill:sub-1:demo-site",
        websiteUrl: "https://example.com",
      }),
    ).toEqual({
      source: "aat.ee",
      idempotencyKey: "skill:sub-1:demo-site",
      targetSiteId: "demo-site",
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

  it("drops private external URLs from receiver responses before status/canary use", () => {
    expect(
      extractSkillPostExternalFields({
        id: 123,
        url: "http://127.0.0.1/admin",
      }),
    ).toEqual({
      externalId: "123",
      externalUrl: undefined,
    })

    expect(
      extractSkillPostExternalFields({
        sites: [{ id: "tool_1", url: "http://localhost:3000/internal" }],
      }),
    ).toEqual({
      externalId: "tool_1",
      externalUrl: undefined,
    })

    expect(
      extractSkillPostExternalFields({
        id: 456,
        url: "http://localhost./internal",
      }),
    ).toEqual({
      externalId: "456",
      externalUrl: undefined,
    })

    expect(
      isSuccessfulSkillPostResponse(
        200,
        { ok: true, url: "http://169.254.169.254/latest/meta-data" },
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
    expect(isSuccessfulSkillPostResponse(204, {}, { allowEmpty2xx: true })).toBe(false)
    expect(isSuccessfulSkillPostResponse(204, {}, { allowEmpty2xx: true, emptyBody: true })).toBe(
      true,
    )
    expect(
      isSuccessfulSkillPostResponse(
        200,
        { error: "missing idempotencyKey" },
        { allowEmpty2xx: true },
      ),
    ).toBe(false)
    expect(isSuccessfulSkillPostResponse(204, {}, { requireExternalUrl: true })).toBe(false)
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

  it("requires explicit unpublish endpoints when launch URLs do not end with /launch", () => {
    vi.stubEnv("SKILL_PUBLISH_GATEWAY_URL", "https://gateway.example/api/external")

    expect(skillSiteUnpublishEndpoint("gateway")).toBeNull()

    vi.stubEnv("SKILL_PUBLISH_GATEWAY_UNPUBLISH_URL", "https://gateway.example/api/unpublish")
    expect(skillSiteUnpublishEndpoint("gateway")).toBe("https://gateway.example/api/unpublish")
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

  it("validates configured receiver endpoint URLs", () => {
    expect(skillSiteEnvName("demo-site")).toBe("DEMO_SITE")
    expect(validateSkillEndpointUrl("https://qoo.im/api/external/launch")).toBeNull()
    expect(validateSkillEndpointUrl("javascript:alert(1)")).toBe("must be an http(s) URL")
    expect(validateSkillEndpointUrl("https://user:pass@example.com/launch")).toBe(
      "must not include embedded credentials",
    )
    expect(validateSkillEndpointUrl("http://127.0.0.1:3000/api/external/launch")).toBe(
      "must not use a private or localhost hostname",
    )
    expect(validateSkillEndpointUrl("https://localhost/api/external/launch")).toBe(
      "must not use a private or localhost hostname",
    )

    vi.stubEnv("SKILL_PUBLISH_DEMO_SITE_URL", "javascript:alert(1)")
    vi.stubEnv("SKILL_PUBLISH_API_KEY", "shared")
    expect(skillSiteLaunchConfigError("demo-site")).toBe(
      "SKILL_PUBLISH_DEMO_SITE_URL must be an http(s) URL",
    )
  })

  it("redacts endpoint credentials before logging", () => {
    expect(
      redactSkillEndpointUrl("https://user:pass@example.com/api/external/launch?token=secret#frag"),
    ).toBe("https://example.com/api/external/launch")
    expect(redactSkillEndpointUrl("javascript:secret-token")).toBe("[invalid URL]")
    expect(redactSkillEndpointUrl("not a url with secret")).toBe("[invalid URL]")
  })

  it("prefers per-site API keys and falls back to the shared skill key", () => {
    vi.stubEnv("SKILL_PUBLISH_API_KEY", "shared")
    vi.stubEnv("SKILL_PUBLISH_BIGKR_API_KEY", "site")

    expect(skillSiteApiKey("bigkr")).toBe("site")
    expect(skillSiteApiKey("mf8")).toBe("shared")
  })
})
