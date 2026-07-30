import { describe, expect, it } from "vitest"

import {
  evaluateRouteBudgets,
  parseRouteBudgetConfig,
  type RouteBudgetConfig,
} from "@/lib/route-budget"

const config: RouteBudgetConfig = {
  mode: "enforce",
  routes: [
    { route: "/[locale]/page", maxInitialGzipBytes: 160_000 },
    { route: "/[locale]/projects/submit/page", maxInitialGzipBytes: 310_000 },
  ],
}

describe("route bundle budgets", () => {
  it("passes complete measurements below the limits", () => {
    expect(
      evaluateRouteBudgets(config, [
        { route: "/[locale]/page", initialGzipBytes: 140_000 },
        { route: "/[locale]/projects/submit/page", initialGzipBytes: 280_000 },
      ]),
    ).toEqual({ mode: "enforce", passed: true, blocking: false, violations: [] })
  })

  it("fails closed for oversized and missing routes", () => {
    const result = evaluateRouteBudgets(config, [
      { route: "/[locale]/page", initialGzipBytes: 160_001 },
    ])
    expect(result.blocking).toBe(true)
    expect(result.violations).toEqual([
      "/[locale]/page: initial gzip 160001 > 160000 bytes",
      "/[locale]/projects/submit/page: missing measurement",
    ])
  })

  it("keeps observe mode non-blocking while reporting violations", () => {
    const result = evaluateRouteBudgets(
      { ...config, mode: "observe" },
      config.routes.map(({ route }) => ({ route, initialGzipBytes: 999_999 })),
    )
    expect(result.passed).toBe(false)
    expect(result.blocking).toBe(false)
  })

  it("rejects malformed or duplicate configuration", () => {
    expect(() => parseRouteBudgetConfig({ mode: "enforce", routes: [] })).toThrow()
    expect(() =>
      parseRouteBudgetConfig({
        mode: "enforce",
        routes: [
          { route: "/[locale]/page", maxInitialGzipBytes: 1 },
          { route: "/[locale]/page", maxInitialGzipBytes: 2 },
        ],
      }),
    ).toThrow("duplicate route budget")
  })
})
