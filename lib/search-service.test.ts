import { beforeEach, describe, expect, it, vi } from "vitest"

import { getCachedProjectSearchPage } from "@/lib/search-service"

const searchProjectsMock = vi.hoisted(() => vi.fn())
const cacheStores = vi.hoisted(() => [] as Array<Map<string, Promise<unknown>>>)
const unstableCacheMock = vi.hoisted(() =>
  vi.fn((callback: (...args: unknown[]) => Promise<unknown>) => {
    const store = new Map<string, Promise<unknown>>()
    cacheStores.push(store)

    return (...args: unknown[]) => {
      const key = JSON.stringify(args)
      const existing = store.get(key)
      if (existing) return existing

      const result = callback(...args)
      store.set(key, result)
      return result
    }
  }),
)

vi.mock("next/cache", () => ({ unstable_cache: unstableCacheMock }))
vi.mock("@/drizzle/db", () => ({ db: {} }))
vi.mock("@/lib/search-projects", () => ({ searchProjects: searchProjectsMock }))

const hits = Array.from({ length: 25 }, (_, index) => ({
  id: `project-${index}`,
  name: `Project ${index}`,
  slug: `project-${index}`,
  description: null,
  logoUrl: null,
}))

beforeEach(() => {
  searchProjectsMock.mockReset()
  searchProjectsMock.mockResolvedValue({ hits, totalCount: hits.length })
  for (const store of cacheStores) store.clear()
})

describe("getCachedProjectSearchPage", () => {
  it("shares a canonical cache page between command-palette and results-page limits", async () => {
    const commandPalette = await getCachedProjectSearchPage("  ai  ", 10, 0)
    const resultPage = await getCachedProjectSearchPage("ai", 20, 0)

    expect(searchProjectsMock).toHaveBeenCalledTimes(1)
    expect(searchProjectsMock).toHaveBeenCalledWith({ query: "ai", limit: 20, offset: 0 })
    expect(commandPalette.hits).toHaveLength(10)
    expect(resultPage.hits).toHaveLength(20)
    expect(commandPalette.totalCount).toBe(25)
    expect(resultPage.totalCount).toBe(25)
  })

  it("does not query for an incomplete search term", async () => {
    await expect(getCachedProjectSearchPage(" ", 10, 0)).resolves.toEqual({
      hits: [],
      totalCount: 0,
    })
    expect(searchProjectsMock).not.toHaveBeenCalled()
  })

  it("keeps cache pagination bounded when a future caller bypasses route parsing", async () => {
    const result = await getCachedProjectSearchPage("ai", Number.NaN, Number.POSITIVE_INFINITY)

    expect(searchProjectsMock).toHaveBeenCalledWith({ query: "ai", limit: 20, offset: 0 })
    expect(result.hits).toHaveLength(20)
  })
})
