import { describe, expect, it } from "vitest"

import { evaluatePerformanceBudget, type PerformanceBudgetConfig } from "./performance-budget"

const config: PerformanceBudgetConfig = {
  mode: "observe",
  route: "/[locale]/page",
  path: "/",
  budgets: {
    routeJsGzipBytes: 100,
    htmlBytes: 200,
    lighthousePerformance: 0.8,
    lcpMs: 2500,
  },
}

describe("evaluatePerformanceBudget", () => {
  it("reports threshold violations without blocking in observation mode", () => {
    expect(
      evaluatePerformanceBudget(config, {
        routeJsGzipBytes: 101,
        htmlBytes: 201,
        lighthousePerformance: 0.81,
        lcpMs: 2501,
      }),
    ).toEqual({
      mode: "observe",
      passed: false,
      blocking: false,
      violations: ["routeJsGzipBytes: 101 > 100", "htmlBytes: 201 > 200", "lcpMs: 2501 > 2500"],
    })
  })

  it("blocks the same violation after the explicit enforcement switch", () => {
    const result = evaluatePerformanceBudget(
      { ...config, mode: "enforce" },
      {
        routeJsGzipBytes: 90,
        htmlBytes: 190,
        lighthousePerformance: 0.9,
        lcpMs: 2600,
      },
    )
    expect(result.blocking).toBe(true)
    expect(result.violations).toEqual(["lcpMs: 2600 > 2500"])
  })

  it("rejects missing or malformed instrumentation instead of silently passing", () => {
    expect(() =>
      evaluatePerformanceBudget(config, {
        routeJsGzipBytes: Number.NaN,
        htmlBytes: 190,
        lighthousePerformance: 0.9,
        lcpMs: 2000,
      }),
    ).toThrow("invalid performance measurement")
  })
})
