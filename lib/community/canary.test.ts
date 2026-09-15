import { describe, expect, it } from "vitest"

import {
  communityCanaryCookieValue,
  evaluateCommunityCanaryBudget,
  hasCommunityCanaryCookie,
  medianCommunityCanaryTtfb,
  parseCommunityCanaryArguments,
  resolveCommunityCanaryRedirect,
} from "./canary"

describe("community canary arguments", () => {
  it("accepts an origin-only target and optional explicit timing budgets", () => {
    const options = parseCommunityCanaryArguments([
      "--base-url",
      "https://staging.aat.ee",
      "--mode",
      "enabled",
      "--runs",
      "4",
      "--max-initial-ttfb-ms",
      "1800",
      "--max-warm-ttfb-ms",
      "900",
    ])

    expect(options).toMatchObject({
      mode: "enabled",
      runs: 4,
      maxInitialTtfbMs: 1800,
      maxWarmTtfbMs: 900,
    })
    expect(options.baseUrl.href).toBe("https://staging.aat.ee/")
  })

  it.each([
    [[], "--base-url is required"],
    [["--base-url", "https://staging.aat.ee"], "--mode is required"],
    [
      ["--base-url", "https://user:secret@staging.aat.ee", "--mode", "enabled"],
      "--base-url must not include credentials",
    ],
    [
      ["--base-url", "https://staging.aat.ee/community", "--mode", "enabled"],
      "--base-url must be an origin without a path, query, or hash",
    ],
    [
      ["--base-url", "https://staging.aat.ee", "--mode", "open"],
      "--mode must be disabled or enabled",
    ],
    [
      ["--base-url", "https://staging.aat.ee", "--mode", "enabled", "--runs", "0"],
      "--runs must be between 1 and 10",
    ],
    [
      ["--base-url", "https://staging.aat.ee", "--mode", "disabled", "--max-warm-ttfb-ms", "500"],
      "TTFB budgets require --mode enabled",
    ],
  ])("rejects invalid arguments", (argv, message) => {
    expect(() => parseCommunityCanaryArguments(argv)).toThrow(message)
  })
})

describe("community canary response helpers", () => {
  it("accepts same-origin relative and absolute redirects", () => {
    const baseUrl = new URL("https://staging.aat.ee/")
    expect(resolveCommunityCanaryRedirect(baseUrl, "/community?type=shipped").href).toBe(
      "https://staging.aat.ee/community?type=shipped",
    )
    expect(
      resolveCommunityCanaryRedirect(baseUrl, "https://staging.aat.ee/community").pathname,
    ).toBe("/community")
  })

  it("rejects redirect targets outside the selected origin", () => {
    expect(() =>
      resolveCommunityCanaryRedirect(new URL("https://staging.aat.ee/"), "https://other.example/"),
    ).toThrow("redirect leaves the canary origin")
    expect(() =>
      resolveCommunityCanaryRedirect(new URL("https://staging.aat.ee/"), "/community#unexpected"),
    ).toThrow("redirect must not include a hash")
  })

  it("finds an emitted locale cookie without confusing attributes or prefixed names", () => {
    expect(
      communityCanaryCookieValue(
        "session=ok; Expires=Wed, 21 Oct 2026 07:28:00 GMT; Path=/, NEXT_LOCALE=zh; Path=/",
        "NEXT_LOCALE",
      ),
    ).toBe("zh")
    expect(
      hasCommunityCanaryCookie("session=ok; Path=/, NEXT_LOCALE=zh; Path=/", "NEXT_LOCALE"),
    ).toBe(true)
    expect(hasCommunityCanaryCookie("NOT_NEXT_LOCALE=zh; Path=/", "NEXT_LOCALE")).toBe(false)
    expect(hasCommunityCanaryCookie("session=ok; Path=/", "NEXT_LOCALE")).toBe(false)
  })
})

describe("community canary timing budget", () => {
  const options = parseCommunityCanaryArguments([
    "--base-url",
    "http://localhost:3100",
    "--mode",
    "enabled",
    "--max-initial-ttfb-ms",
    "100",
    "--max-warm-ttfb-ms",
    "50",
  ])

  it("uses the median warm sample and reports only configured violations", () => {
    expect(medianCommunityCanaryTtfb([90, 20, 40])).toBe(40)
    expect(
      evaluateCommunityCanaryBudget(options, { initialTtfbMs: 101, warmTtfbMs: [70, 30, 50] }),
    ).toEqual({
      initialTtfbMs: 101,
      warmMedianTtfbMs: 50,
      passed: false,
      violations: ["initial TTFB 101 ms exceeds 100 ms"],
    })
  })

  it("observes timing without a fabricated blocking budget", () => {
    const observe = parseCommunityCanaryArguments([
      "--base-url",
      "http://localhost:3100",
      "--mode",
      "enabled",
    ])
    expect(
      evaluateCommunityCanaryBudget(observe, { initialTtfbMs: 5000, warmTtfbMs: [4000] }),
    ).toMatchObject({ passed: true, warmMedianTtfbMs: 4000, violations: [] })
  })
})
