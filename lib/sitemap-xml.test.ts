import { afterEach, describe, expect, it } from "vitest"

import {
  englishSitemapEntry,
  localizedSitemapEntries,
  serializeSitemap,
  serializeSitemapIndex,
} from "@/lib/sitemap-xml"

const originalUrl = process.env.NEXT_PUBLIC_URL

afterEach(() => {
  if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_URL
  else process.env.NEXT_PUBLIC_URL = originalUrl
})

describe("sitemap XML", () => {
  it("builds a small index for the split sitemap routes", () => {
    process.env.NEXT_PUBLIC_URL = "https://www.aat.ee/"
    const xml = serializeSitemapIndex()
    expect(xml).toContain("<sitemapindex")
    expect(xml).toContain("https://www.aat.ee/sitemaps/projects.xml")
    expect(xml).toContain("https://www.aat.ee/sitemaps/tags.xml")
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
