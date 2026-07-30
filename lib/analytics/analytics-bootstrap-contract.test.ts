import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

import { describe, expect, it } from "vitest"

const repositoryRoot = resolve(import.meta.dirname, "../..")

describe("analytics bootstrap privacy contract", () => {
  it("removes query and fragment before explicit GA and Matomo pageviews", async () => {
    const layout = await readFile(resolve(repositoryRoot, "app/layout.tsx"), "utf8")

    const stripQuery = layout.indexOf("analyticsPageUrl.search = '';")
    const stripFragment = layout.indexOf("analyticsPageUrl.hash = '';")
    const googlePageview = layout.indexOf(
      "gtag('config', gaId, { page_location: analyticsPageUrl.toString() });",
    )
    const matomoPageview = layout.indexOf(
      "_paq.push(['setCustomUrl', analyticsPageUrl.toString()]);",
    )

    expect(stripQuery).toBeGreaterThan(-1)
    expect(stripFragment).toBeGreaterThan(stripQuery)
    expect(googlePageview).toBeGreaterThan(stripFragment)
    expect(matomoPageview).toBeGreaterThan(stripFragment)
  })
})
