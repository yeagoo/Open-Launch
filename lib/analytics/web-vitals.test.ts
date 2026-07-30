import { describe, expect, it } from "vitest"

import {
  buildWebVitalMatomoCommands,
  getWebVitalDeviceClass,
  getWebVitalRouteDimensions,
  parseWebVitalsSampleRate,
} from "./web-vitals"

describe("privacy-safe Web Vitals payloads", () => {
  it("maps public URLs to an allowlisted route family without retaining slugs or searches", () => {
    expect(
      getWebVitalRouteDimensions(
        "https://www.aat.ee/es/projects/private-product?query=alice@example.com",
      ),
    ).toEqual({ routeFamily: "project_detail", locale: "es" })
    expect(getWebVitalRouteDimensions("https://www.aat.ee/dashboard")).toBeNull()
    expect(getWebVitalRouteDimensions("https://www.aat.ee/es/search?q=secret")).toBeNull()
  })

  it("emits only allowlisted dimensions and numeric LCP attribution", () => {
    const commands = buildWebVitalMatomoCommands(
      {
        name: "LCP",
        value: 4400.4,
        rating: "poor",
        navigationURL: "https://www.aat.ee/es/projects/private-product",
        attribution: {
          timeToFirstByte: 800.1,
          resourceLoadDelay: 200,
          resourceLoadDuration: 1500,
          elementRenderDelay: 1900,
        },
      },
      { routeFamily: "project_detail", locale: "es", deviceClass: "mobile" },
      "https://www.aat.ee/es/projects/private-product?query=alice@example.com",
    )
    const eventPayload = JSON.stringify(commands.slice(0, -1))

    expect(commands).toHaveLength(7)
    expect(commands[0]).toEqual(["setCustomUrl", "https://www.aat.ee/__rum/es/project_detail"])
    expect(eventPayload).not.toContain("private-product")
    expect(eventPayload).not.toContain("alice@example.com")
    expect(eventPayload).not.toContain("query")
    expect(eventPayload).not.toContain("navigationURL")
    expect(eventPayload).not.toContain("target")
  })

  it("fails closed for sampling and derives device class from viewport width", () => {
    expect(parseWebVitalsSampleRate(undefined)).toBe(0)
    expect(parseWebVitalsSampleRate("0.05")).toBe(0.05)
    expect(() => parseWebVitalsSampleRate("1.1")).toThrow()
    expect(() => parseWebVitalsSampleRate("not-a-number")).toThrow()
    expect(getWebVitalDeviceClass(390)).toBe("mobile")
    expect(getWebVitalDeviceClass(900)).toBe("tablet")
    expect(getWebVitalDeviceClass(1440)).toBe("desktop")
  })

  it("rejects dimensions that did not come from the route and device allowlists", () => {
    expect(
      buildWebVitalMatomoCommands(
        { name: "LCP", value: 1000, rating: "good" },
        {
          routeFamily: "projects/private-slug",
          locale: "invalid",
          deviceClass: "mobile",
        },
        "https://www.aat.ee/",
      ),
    ).toEqual([])
  })
})
