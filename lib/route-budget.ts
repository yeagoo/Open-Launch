export type RouteBudgetMode = "observe" | "enforce"

export interface RouteBudget {
  route: string
  maxInitialGzipBytes: number
}

export interface RouteBudgetConfig {
  mode: RouteBudgetMode
  routes: RouteBudget[]
}

export interface RouteMeasurement {
  route: string
  initialGzipBytes: number
}

export interface RouteBudgetEvaluation {
  mode: RouteBudgetMode
  passed: boolean
  blocking: boolean
  violations: string[]
}

export function parseRouteBudgetConfig(input: unknown): RouteBudgetConfig {
  if (!input || typeof input !== "object") throw new Error("route budget config must be an object")
  const config = input as Partial<RouteBudgetConfig>
  if (config.mode !== "observe" && config.mode !== "enforce") {
    throw new Error("route budget mode must be observe or enforce")
  }
  if (!Array.isArray(config.routes) || config.routes.length === 0) {
    throw new Error("route budget config must contain at least one route")
  }

  const seenRoutes = new Set<string>()
  const routes = config.routes.map((candidate, index) => {
    if (!candidate || typeof candidate !== "object") {
      throw new Error(`invalid route budget at index ${index}`)
    }
    const route = (candidate as Partial<RouteBudget>).route
    const maxInitialGzipBytes = (candidate as Partial<RouteBudget>).maxInitialGzipBytes
    if (
      typeof route !== "string" ||
      !route.startsWith("/") ||
      !route.endsWith("/page") ||
      route.includes("..") ||
      route.includes("\\")
    ) {
      throw new Error(`invalid route budget path at index ${index}`)
    }
    if (!Number.isSafeInteger(maxInitialGzipBytes) || Number(maxInitialGzipBytes) <= 0) {
      throw new Error(`invalid route gzip budget for ${route}`)
    }
    if (seenRoutes.has(route)) throw new Error(`duplicate route budget: ${route}`)
    seenRoutes.add(route)
    return { route, maxInitialGzipBytes: Number(maxInitialGzipBytes) }
  })
  return { mode: config.mode, routes }
}

export function evaluateRouteBudgets(
  config: RouteBudgetConfig,
  measurements: RouteMeasurement[],
): RouteBudgetEvaluation {
  const measurementByRoute = new Map<string, number>()
  for (const measurement of measurements) {
    if (
      !measurement ||
      typeof measurement.route !== "string" ||
      !Number.isSafeInteger(measurement.initialGzipBytes) ||
      measurement.initialGzipBytes < 0
    ) {
      throw new Error("invalid route bundle measurement")
    }
    if (measurementByRoute.has(measurement.route)) {
      throw new Error(`duplicate route measurement: ${measurement.route}`)
    }
    measurementByRoute.set(measurement.route, measurement.initialGzipBytes)
  }

  const violations: string[] = []
  for (const budget of config.routes) {
    const actual = measurementByRoute.get(budget.route)
    if (actual === undefined) {
      violations.push(`${budget.route}: missing measurement`)
    } else if (actual > budget.maxInitialGzipBytes) {
      violations.push(
        `${budget.route}: initial gzip ${actual} > ${budget.maxInitialGzipBytes} bytes`,
      )
    }
  }
  return {
    mode: config.mode,
    passed: violations.length === 0,
    blocking: config.mode === "enforce" && violations.length > 0,
    violations,
  }
}
