import { describe, expect, it } from "vitest"

import { getMatomoPageUrl } from "./matomo"

describe("getMatomoPageUrl", () => {
  it("removes all query parameters before analytics tracking", () => {
    expect(
      getMatomoPageUrl(
        "https://www.aat.ee/en/payment/success?session_id=secret&state=oauth&page=2",
      ),
    ).toBe("https://www.aat.ee/en/payment/success")
  })

  it("does not retain free-text search or filter values", () => {
    expect(getMatomoPageUrl("https://www.aat.ee/en/dashboard?TOKEN=secret&filter=active")).toBe(
      "https://www.aat.ee/en/dashboard",
    )
  })

  it("removes URL fragments", () => {
    expect(getMatomoPageUrl("https://www.aat.ee/en/projects?page=3&sort=popular#results")).toBe(
      "https://www.aat.ee/en/projects",
    )
  })
})
