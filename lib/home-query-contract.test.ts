import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

import { describe, expect, it } from "vitest"

const repositoryRoot = resolve(import.meta.dirname, "..")

describe("Phase 4 homepage query contract", () => {
  it("pre-aggregates upvotes and comments instead of joining both detail tables", async () => {
    const source = await readFile(resolve(repositoryRoot, "app/actions/home.ts"), "utf8")

    expect(source).toContain(".groupBy(upvote.projectId)")
    expect(source).toContain(".groupBy(fumaComments.page)")
    expect(source).toContain("projectId: fumaComments.page")
    expect(source).not.toContain('as("project_id")')
    expect(source).toContain(".leftJoin(homeUpvoteCounts")
    expect(source).toContain(".leftJoin(homeCommentCounts")
    expect(source).not.toContain(".leftJoin(upvote,")
    expect(source).not.toContain(".leftJoin(fumaComments,")
    expect(source).not.toMatch(/count\s*\(\s*distinct/i)
  })

  it("uses one combined user-upvote lookup for the homepage groups", async () => {
    const source = await readFile(resolve(repositoryRoot, "app/actions/home.ts"), "utf8")
    const groupedRead = source.slice(
      source.indexOf("export async function getHomeProjectGroups"),
      source.indexOf("export async function getTodayProjects"),
    )

    expect(groupedRead.match(/getUpvotedSet\(/g)).toHaveLength(1)
    expect(groupedRead).toContain("uniqueProjectIdsFromGroups(baseGroups)")
    expect(groupedRead).toContain("localizeProjectDescriptionGroups(baseGroups, locale)")
    expect(groupedRead).toContain("attachUserUpvotesToGroups(displayGroups, upvoted)")
  })

  it("keeps the heavy command dialog behind a first-use dynamic import", async () => {
    const [navSource, lazySource] = await Promise.all([
      readFile(resolve(repositoryRoot, "components/layout/nav.tsx"), "utf8"),
      readFile(resolve(repositoryRoot, "components/layout/search-command-lazy.tsx"), "utf8"),
    ])

    expect(navSource).toContain('from "./search-command-lazy"')
    expect(navSource).not.toContain('from "./search-command"')
    expect(lazySource).toContain('import("./search-command")')
    expect(lazySource).not.toMatch(/^import .*from ["']\.\/search-command["']/m)
  })

  it("routes Nav, Home and current-user reads through the shared server session getter", async () => {
    const [authSource, navSource, homePageSource] = await Promise.all([
      readFile(resolve(repositoryRoot, "lib/server-auth.ts"), "utf8"),
      readFile(resolve(repositoryRoot, "components/layout/nav.tsx"), "utf8"),
      readFile(resolve(repositoryRoot, "app/[locale]/page.tsx"), "utf8"),
    ])

    expect(authSource.match(/auth\.api\.getSession\(\{/g)).toHaveLength(1)
    expect(navSource).toContain("getServerSession()")
    expect(homePageSource).toContain("getServerSession()")
    expect(navSource).not.toContain("auth.api.getSession")
    expect(homePageSource).not.toContain("auth.api.getSession")
  })
})
