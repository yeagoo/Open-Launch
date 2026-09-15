import { beforeEach, describe, expect, it, vi } from "vitest"

import CommunityMinePage from "@/app/community/mine/page"
import CommunitySavedPage from "@/app/community/saved/page"

const mocks = vi.hoisted(() => ({ permanentRedirect: vi.fn() }))

vi.mock("next/navigation", () => ({ permanentRedirect: mocks.permanentRedirect }))

describe("legacy community personal-feed addresses", () => {
  beforeEach(() => vi.clearAllMocks())

  it("redirects the early Mine address to the canonical feed query", () => {
    CommunityMinePage()
    expect(mocks.permanentRedirect).toHaveBeenCalledWith("/community?view=mine")
  })

  it("redirects the early Saved address to the canonical feed query", () => {
    CommunitySavedPage()
    expect(mocks.permanentRedirect).toHaveBeenCalledWith("/community?view=saved")
  })
})
