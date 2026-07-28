import { afterEach, describe, expect, it } from "vitest"

import {
  englishSitemapEntry,
  getSitemapIndexPaths,
  localizedSitemapEntries,
  parseSitemapRoute,
  serializeSitemap,
  serializeSitemapIndex,
} from "@/lib/sitemap-xml"

const originalUrl = process.env.NEXT_PUBLIC_URL

afterEach(() => {
  if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_URL
  else process.env.NEXT_PUBLIC_URL = originalUrl
})

describe("sitemap XML", () => {
  it("builds an index with one entry per computed project, tag, and user shard", () => {
    process.env.NEXT_PUBLIC_URL = "https://www.aat.ee/"
    const paths = getSitemapIndexPaths({ projects: 501, tags: 751, users: 578 })
    const xml = serializeSitemapIndex(paths)

    expect(xml).toContain("<sitemapindex")
    expect(xml).toContain("https://www.aat.ee/sitemaps/projects-1.xml")
    expect(xml).toContain("https://www.aat.ee/sitemaps/projects-3.xml")
    expect(xml).not.toContain("https://www.aat.ee/sitemaps/projects-4.xml")
    expect(xml).toContain("https://www.aat.ee/sitemaps/tags-4.xml")
    expect(xml).not.toContain("https://www.aat.ee/sitemaps/tags-5.xml")
    expect(xml).toContain("https://www.aat.ee/sitemaps/users-3.xml")
    expect(xml).not.toContain("https://www.aat.ee/sitemaps/tags.xml")
  })

  it("keeps one empty shard and parses only bounded shard routes", () => {
    const emptyPaths = getSitemapIndexPaths({ projects: 0, tags: 0, users: 0 })
    expect(emptyPaths).toContain("projects-1")
    expect(emptyPaths).toContain("tags-1")
    expect(parseSitemapRoute("projects.xml")).toBeNull()
    expect(parseSitemapRoute("tags.xml")).toBeNull()
    expect(parseSitemapRoute("users.xml")).toBeNull()
    expect(parseSitemapRoute("projects-12.xml")).toEqual({ kind: "projects", shard: 12 })
    expect(parseSitemapRoute("tags-2.xml")).toEqual({ kind: "tags", shard: 2 })
    expect(parseSitemapRoute("users-3.xml")).toEqual({ kind: "users", shard: 3 })
    expect(parseSitemapRoute("projects-0.xml")).toBeNull()
    expect(parseSitemapRoute("projects-1001.xml")).toBeNull()
    expect(parseSitemapRoute("projects-1.json")).toBeNull()
  })

  it("uses stable optional dates and escapes dynamic URL content", () => {
    process.env.NEXT_PUBLIC_URL = "https://www.aat.ee"
    const xml = serializeSitemap([
      englishSitemapEntry("/compare/a&b", {
        lastModified: new Date("2026-07-01T00:00:00.000Z"),
      }),
    ])
    expect(xml).toContain("/compare/a&amp;b")
    expect(xml).toContain("<lastmod>2026-07-01T00:00:00.000Z</lastmod>")
  })

  it("accepts dates restored from the unstable cache JSON payload", () => {
    const cachedEntries = JSON.parse(
      JSON.stringify([
        englishSitemapEntry("/blog/cached", {
          lastModified: new Date("2026-07-27T12:34:56.000Z"),
        }),
      ]),
    )

    expect(serializeSitemap(cachedEntries)).toContain("<lastmod>2026-07-27T12:34:56.000Z</lastmod>")
  })

  it("emits every locale and x-default without inventing lastmod", () => {
    const entries = localizedSitemapEntries("/projects/example")
    expect(entries).toHaveLength(8)
    expect(entries[0].alternates?.["x-default"]).toBe("https://www.aat.ee/projects/example")
    expect(serializeSitemap(entries)).not.toContain("<lastmod>")
  })
})
