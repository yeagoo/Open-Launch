import { describe, expect, it } from "vitest"

import { buildSyndicationLaunchRequestBody, type LaunchPayload } from "./launch-syndication"

const ORDER_ID = "11111111-1111-4111-8111-111111111111"
const PLACEMENT_ID = "22222222-2222-4222-8222-222222222222"
const payload: LaunchPayload = {
  source: "aat.ee",
  name: "Acme",
  tagline: "Analytics for founders",
  description: "A useful analytics product.",
  websiteUrl: "https://acme.example",
  logoUrl: null,
  coverImageUrl: null,
  images: [],
  pricing: "freemium",
  platforms: ["Web"],
  githubUrl: null,
  twitterUrl: null,
  categoryName: null,
  tier: "pro",
}

describe("paid launch request body", () => {
  it("adds the real Campaign and placement identity only for Hicyou", () => {
    expect(
      buildSyndicationLaunchRequestBody("hicyou", ORDER_ID, payload, {
        placementId: PLACEMENT_ID,
        sourceUpdatedAt: new Date("2026-08-26T12:00:00.000Z"),
      }),
    ).toEqual({
      ...payload,
      idempotencyKey: ORDER_ID,
      campaign: {
        id: ORDER_ID,
        placementId: PLACEMENT_ID,
        targetSiteId: "hicyou",
        sourceUpdatedAt: "2026-08-26T12:00:00.000Z",
      },
    })
  })

  it("preserves the existing receiver contract for other partners", () => {
    expect(buildSyndicationLaunchRequestBody("bigkr", ORDER_ID, payload)).toEqual({
      ...payload,
      idempotencyKey: ORDER_ID,
    })
  })
})
