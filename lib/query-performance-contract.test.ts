import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

import { describe, expect, it } from "vitest"

const repositoryRoot = resolve(import.meta.dirname, "..")

describe("query performance contracts", () => {
  it("keeps the project list free of duplicated session reads and cross-product aggregates", async () => {
    const [pageSource, actionSource] = await Promise.all([
      readFile(resolve(repositoryRoot, "app/[locale]/projects/page.tsx"), "utf8"),
      readFile(resolve(repositoryRoot, "app/actions/projects-page.ts"), "utf8"),
    ])

    expect(pageSource).toContain("getServerSession()")
    expect(pageSource).not.toContain("auth.api.getSession")
    expect(pageSource).not.toContain('from "next/headers"')
    expect(pageSource).toContain("getMonthProjects(page, 10, locale)")

    expect(actionSource).toContain("getProjectEngagementCounts(projectIds)")
    expect(actionSource).not.toContain(".leftJoin(upvote,")
    expect(actionSource).not.toContain(".leftJoin(fumaComments,")
    expect(actionSource).not.toMatch(/count\s*\(\s*distinct/i)
  })

  it("shares cached project search between the results page and command palette", async () => {
    const [searchPageSource, apiSource, serviceSource] = await Promise.all([
      readFile(resolve(repositoryRoot, "app/[locale]/search/page.tsx"), "utf8"),
      readFile(resolve(repositoryRoot, "app/api/search/route.ts"), "utf8"),
      readFile(resolve(repositoryRoot, "lib/search-service.ts"), "utf8"),
    ])

    expect(searchPageSource).toContain("getCachedProjectSearchPage")
    expect(searchPageSource).not.toContain("searchProjects")
    expect(apiSource).toContain("getSearchResults")
    expect(apiSource).not.toContain('from "next/cache"')
    expect(serviceSource).toContain('"search-projects-v2"')
    expect(serviceSource).toContain("SHARED_PROJECT_SEARCH_PAGE_SIZE = 20")
    expect(serviceSource).toContain("const [projectPage, taxonomyResults] = await Promise.all")
    expect(serviceSource).toContain(
      "getCachedProjectSearchPage(query, normalizedLimit, normalizedOffset)",
    )
  })
})
