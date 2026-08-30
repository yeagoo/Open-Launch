import { describe, expect, it } from "vitest"

import { resolveHicyouCampaignSyncConfig } from "./hicyou-campaign-sync"

describe("Hicyou Campaign sync configuration", () => {
  it("derives the fixed sync path from the reviewed Hicyou launch endpoint", () => {
    expect(
      resolveHicyouCampaignSyncConfig({
        SYNDICATION_HICYOU_URL: "https://hicyou.example/api/external/launch",
        SYNDICATION_HICYOU_API_KEY: "target-key",
      }),
    ).toEqual({
      ok: true,
      url: "https://hicyou.example/api/external/campaigns/sync",
      apiKey: "target-key",
    })
  })

  it("fails closed for an unsafe configured endpoint", () => {
    const config = resolveHicyouCampaignSyncConfig({
      SYNDICATION_HICYOU_URL: "http://127.0.0.1/api/external/launch",
      SYNDICATION_HICYOU_API_KEY: "target-key",
    })

    expect(config).toMatchObject({ ok: false })
    if (!config.ok) {
      expect(config.error).toContain("credential-free HTTPS")
    }
  })

  it("does not derive a sync callback from a launch URL with a query or credentials", () => {
    expect(
      resolveHicyouCampaignSyncConfig({
        SYNDICATION_HICYOU_URL:
          "https://operator:secret@hicyou.example/api/external/launch?retry=1",
        SYNDICATION_HICYOU_API_KEY: "target-key",
      }),
    ).toMatchObject({ ok: false })
  })
})
