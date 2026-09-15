import { afterEach, describe, expect, it, vi } from "vitest"

import CommunityPreviewPage from "@/app/design-preview/community/page"

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("PREVIEW_NOT_FOUND")
  },
}))
vi.mock("@/app/design-preview/community/community-preview", () => ({
  CommunityPreview: () => null,
}))

afterEach(() => vi.unstubAllEnvs())
describe("community preview production boundary", () => {
  it("returns not found in production without the explicit preview flag", async () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("ENABLE_DESIGN_PREVIEW", "")
    await expect(CommunityPreviewPage()).rejects.toThrow("PREVIEW_NOT_FOUND")
  })
  it("allows the existing explicit preview gate", async () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("ENABLE_DESIGN_PREVIEW", "1")
    expect(await CommunityPreviewPage()).toBeTruthy()
  })
})
