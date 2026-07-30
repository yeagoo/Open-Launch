export type PerformanceBudgetMode = "observe" | "enforce"

export interface PerformanceBudgetConfig {
  mode: PerformanceBudgetMode
  route: string
  path: string
  budgets: {
    routeJsGzipBytes: number
    htmlBytes: number
    lighthousePerformance: number
    lcpMs: number
  }
}

export interface PerformanceMeasurements {
  routeJsGzipBytes: number
  htmlBytes: number
  lighthousePerformance: number
  lcpMs: number
}

export interface PerformanceBudgetResult {
  mode: PerformanceBudgetMode
  passed: boolean
  blocking: boolean
  violations: string[]
}

export function evaluatePerformanceBudget(
  config: PerformanceBudgetConfig,
  measurements: PerformanceMeasurements,
): PerformanceBudgetResult {
  const violations: string[] = []
  const compare = (key: keyof PerformanceMeasurements, actual: number, limit: number) => {
    if (!Number.isFinite(actual) || actual < 0) {
      throw new Error(`invalid performance measurement: ${key}`)
    }
    if (!Number.isFinite(limit) || limit <= 0) {
      throw new Error(`invalid performance budget: ${key}`)
    }
    if (actual > limit) violations.push(`${key}: ${actual} > ${limit}`)
  }
  const compareMinimum = (key: keyof PerformanceMeasurements, actual: number, minimum: number) => {
    if (!Number.isFinite(actual) || actual < 0) {
      throw new Error(`invalid performance measurement: ${key}`)
    }
    if (!Number.isFinite(minimum) || minimum <= 0) {
      throw new Error(`invalid performance budget: ${key}`)
    }
    if (actual < minimum) violations.push(`${key}: ${actual} < ${minimum}`)
  }

  compare("routeJsGzipBytes", measurements.routeJsGzipBytes, config.budgets.routeJsGzipBytes)
  compare("htmlBytes", measurements.htmlBytes, config.budgets.htmlBytes)
  compareMinimum(
    "lighthousePerformance",
    measurements.lighthousePerformance,
    config.budgets.lighthousePerformance,
  )
  compare("lcpMs", measurements.lcpMs, config.budgets.lcpMs)

  return {
    mode: config.mode,
    passed: violations.length === 0,
    blocking: config.mode === "enforce" && violations.length > 0,
    violations,
  }
}
