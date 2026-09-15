export type CommunityCanaryMode = "disabled" | "enabled"

export interface CommunityCanaryOptions {
  baseUrl: URL
  mode: CommunityCanaryMode
  runs: number
  maxInitialTtfbMs?: number
  maxWarmTtfbMs?: number
}

export interface CommunityCanaryTiming {
  initialTtfbMs: number
  warmTtfbMs: number[]
}

export interface CommunityCanaryBudgetEvaluation {
  initialTtfbMs: number
  warmMedianTtfbMs: number
  passed: boolean
  violations: string[]
}

const MAX_RUNS = 10
const MAX_TTFB_MS = 120_000

/**
 * Parse an operator-supplied, origin-only canary target. The check is
 * read-only, but rejecting credentials and paths avoids accidentally sending
 * a request to an unrelated endpoint or printing credentials in its report.
 */
export function parseCommunityCanaryArguments(argv: string[]): CommunityCanaryOptions {
  let baseUrlValue = ""
  let mode: CommunityCanaryMode | undefined
  let runs = 3
  let maxInitialTtfbMs: number | undefined
  let maxWarmTtfbMs: number | undefined
  const seen = new Set<string>()

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    if (!flag?.startsWith("--")) throw new Error("Unknown argument: " + String(flag))
    if (seen.has(flag)) throw new Error("Duplicate argument: " + flag)
    seen.add(flag)

    const value = argv[index + 1]
    if (!value || value.startsWith("--")) throw new Error(flag + " requires a value")
    index += 1

    if (flag === "--base-url") baseUrlValue = value
    else if (flag === "--mode") {
      if (value !== "disabled" && value !== "enabled") {
        throw new Error("--mode must be disabled or enabled")
      }
      mode = value
    } else if (flag === "--runs") runs = parseBoundedInteger(value, "--runs", 1, MAX_RUNS)
    else if (flag === "--max-initial-ttfb-ms") {
      maxInitialTtfbMs = parseBoundedInteger(value, "--max-initial-ttfb-ms", 1, MAX_TTFB_MS)
    } else if (flag === "--max-warm-ttfb-ms") {
      maxWarmTtfbMs = parseBoundedInteger(value, "--max-warm-ttfb-ms", 1, MAX_TTFB_MS)
    } else throw new Error("Unknown argument: " + flag)
  }

  if (!baseUrlValue) throw new Error("--base-url is required")
  if (!mode) throw new Error("--mode is required")
  if (mode === "disabled" && (maxInitialTtfbMs !== undefined || maxWarmTtfbMs !== undefined)) {
    throw new Error("TTFB budgets require --mode enabled")
  }

  return {
    baseUrl: parseBaseUrl(baseUrlValue),
    mode,
    runs,
    maxInitialTtfbMs,
    maxWarmTtfbMs,
  }
}

/** Resolve a redirect only when it remains on the target origin. */
export function resolveCommunityCanaryRedirect(baseUrl: URL, location: string): URL {
  if (!location) throw new Error("redirect response is missing Location")
  const target = new URL(location, baseUrl)
  if (target.origin !== baseUrl.origin) throw new Error("redirect leaves the canary origin")
  if (target.username || target.password) throw new Error("redirect must not include credentials")
  if (target.hash) throw new Error("redirect must not include a hash")
  return target
}

/**
 * `Headers.get('set-cookie')` can join cookie fields. Read each cookie-pair
 * without constructing a regular expression from an operator-provided name.
 */
export function communityCanaryCookieValue(value: string | null, name: string): string | null {
  const expectedName = name.toLowerCase()
  for (const segment of (value ?? "").split(",")) {
    const cookiePair = segment.trimStart().split(";", 1)[0]?.trim()
    if (!cookiePair) continue
    const separator = cookiePair.indexOf("=")
    if (separator <= 0) continue
    if (cookiePair.slice(0, separator).trim().toLowerCase() !== expectedName) continue
    return cookiePair.slice(separator + 1).trim()
  }
  return null
}

/** `Headers.get('set-cookie')` can join values; this detects a named cookie in either form. */
export function hasCommunityCanaryCookie(value: string | null, name: string): boolean {
  return communityCanaryCookieValue(value, name) !== null
}

export function medianCommunityCanaryTtfb(values: number[]): number {
  if (values.length === 0) throw new Error("at least one warm TTFB sample is required")
  if (values.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error("TTFB samples must be finite non-negative numbers")
  }
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!
}

/**
 * Thresholds are intentionally optional: operators establish them from a
 * production-like staging baseline, then pass them explicitly to make the
 * same read-only canary a blocking gate.
 */
export function evaluateCommunityCanaryBudget(
  options: CommunityCanaryOptions,
  timing: CommunityCanaryTiming,
): CommunityCanaryBudgetEvaluation {
  if (!Number.isFinite(timing.initialTtfbMs) || timing.initialTtfbMs < 0) {
    throw new Error("initial TTFB must be a finite non-negative number")
  }
  const warmMedianTtfbMs = medianCommunityCanaryTtfb(timing.warmTtfbMs)
  const violations: string[] = []

  if (options.maxInitialTtfbMs !== undefined && timing.initialTtfbMs > options.maxInitialTtfbMs) {
    violations.push(
      "initial TTFB " + timing.initialTtfbMs + " ms exceeds " + options.maxInitialTtfbMs + " ms",
    )
  }
  if (options.maxWarmTtfbMs !== undefined && warmMedianTtfbMs > options.maxWarmTtfbMs) {
    violations.push(
      "warm median TTFB " + warmMedianTtfbMs + " ms exceeds " + options.maxWarmTtfbMs + " ms",
    )
  }

  return {
    initialTtfbMs: timing.initialTtfbMs,
    warmMedianTtfbMs,
    passed: violations.length === 0,
    violations,
  }
}

function parseBaseUrl(value: string): URL {
  let target: URL
  try {
    target = new URL(value)
  } catch {
    throw new Error("--base-url must be an absolute http or https URL")
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    throw new Error("--base-url must use http or https")
  }
  if (target.username || target.password) throw new Error("--base-url must not include credentials")
  if (target.pathname !== "/" || target.search || target.hash) {
    throw new Error("--base-url must be an origin without a path, query, or hash")
  }
  return new URL(target.origin)
}

function parseBoundedInteger(
  value: string,
  flag: string,
  minimum: number,
  maximum: number,
): number {
  if (!/^\d+$/.test(value)) throw new Error(flag + " must be an integer")
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(flag + " must be between " + minimum + " and " + maximum)
  }
  return parsed
}
