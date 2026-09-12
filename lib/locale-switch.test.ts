import { beforeEach, describe, expect, it, vi } from "vitest"

import { getLocaleSwitchTarget } from "./locale-switch"

const getPathnameMock = vi.hoisted(() => vi.fn())

vi.mock("@/i18n/navigation", () => ({
  getPathname: getPathnameMock,
}))

describe("getLocaleSwitchTarget", () => {
  beforeEach(() => {
    getPathnameMock.mockImplementation(
      ({ href, locale }: { href: string; locale: string }) =>
        `/${locale}${href === "/" ? "" : href}`,
    )
  })

  it("prefixes the default locale so an existing non-default cookie is replaced", () => {
    expect(getLocaleSwitchTarget("/blog/product-hunt-alternatives", "", "en")).toBe(
      "/en/blog/product-hunt-alternatives",
    )
    expect(getPathnameMock).toHaveBeenCalledWith({
      href: "/blog/product-hunt-alternatives",
      locale: "en",
      forcePrefix: true,
    })
  })

  it("preserves the logical path and the complete query string", () => {
    expect(getLocaleSwitchTarget("/projects", "tag=ai&tag=saas&page=2", "zh")).toBe(
      "/zh/projects?tag=ai&tag=saas&page=2",
    )
  })

  it("uses the locale-prefixed root route when no pathname is available", () => {
    expect(getLocaleSwitchTarget(null, "source=nav", "ja")).toBe("/ja?source=nav")
  })
})
