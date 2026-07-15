import { describe, expect, it } from "vitest"

import { getMatomoPageUrl } from "./matomo"

describe("getMatomoPageUrl", () => {
  it("removes sensitive query parameters before analytics tracking", () => {
    expect(
      getMatomoPageUrl(
        "https://www.aat.ee/en/payment/success?session_id=secret&state=oauth&page=2",
      ),
    ).toBe("https://www.aat.ee/en/payment/success?page=2")
  })

  it("matches sensitive query parameter names case-insensitively", () => {
    expect(getMatomoPageUrl("https://www.aat.ee/en/dashboard?TOKEN=secret&filter=active")).toBe(
      "https://www.aat.ee/en/dashboard?filter=active",
    )
  })

  it("preserves ordinary query parameters and URL fragments", () => {
    const url = "https://www.aat.ee/en/projects?page=3&sort=popular#results"

    expect(getMatomoPageUrl(url)).toBe(url)
  })
})
