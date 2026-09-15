import { beforeEach, describe, expect, it, vi } from "vitest"

import { loadCommunityFeedPage } from "./page-loader"

const mocks = vi.hoisted(() => ({
  connection: vi.fn(),
  enabled: vi.fn(),
  service: vi.fn(),
  searchAllowed: vi.fn(),
}))

vi.mock("next/server", () => ({ connection: mocks.connection }))
vi.mock("./server", () => ({
  getCommunityServerService: mocks.service,
  isCommunityEnabled: mocks.enabled,
}))
vi.mock("./read-limits", () => ({ isCommunitySearchAllowed: mocks.searchAllowed }))

const query = {
  view: "all" as const,
  type: "All" as const,
  sort: "Latest" as const,
  search: "release",
}

describe("community page loader", () => {
  const service = {
    loadFeedPage: vi.fn(),
    loadViewer: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.connection.mockResolvedValue(undefined)
    mocks.enabled.mockReturnValue(true)
    mocks.service.mockReturnValue(service)
    mocks.searchAllowed.mockResolvedValue(true)
  })

  it("reads the runtime flag after connection and returns server-rendered feed data", async () => {
    const initial = {
      feed: { posts: [] },
      viewer: { id: null, role: "anonymous" as const, canParticipate: false },
    }
    service.loadFeedPage.mockResolvedValue(initial)

    await expect(loadCommunityFeedPage(query)).resolves.toEqual(initial)
    expect(mocks.connection).toHaveBeenCalledOnce()
    expect(mocks.enabled).toHaveBeenCalledOnce()
    expect(service.loadFeedPage).toHaveBeenCalledWith(query)
  })

  it("returns a recoverable empty search state when the public search budget is exhausted", async () => {
    mocks.searchAllowed.mockResolvedValue(false)
    service.loadViewer.mockResolvedValue({ id: null, role: "anonymous", canParticipate: false })

    await expect(loadCommunityFeedPage(query)).resolves.toEqual({
      feed: { posts: [] },
      viewer: { id: null, role: "anonymous", canParticipate: false },
      rateLimited: true,
    })
    expect(service.loadFeedPage).not.toHaveBeenCalled()
  })

  it("fails closed when the feature flag is disabled", async () => {
    mocks.enabled.mockReturnValue(false)
    await expect(loadCommunityFeedPage(query)).rejects.toMatchObject({ code: "missing" })
    expect(mocks.service).not.toHaveBeenCalled()
  })
})
