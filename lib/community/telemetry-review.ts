export type CommunityTelemetryEventName = "community_operation_slow" | "community_service_error"

export interface CommunityTelemetryOptions {
  inputPath: string
  maxSlowEvents?: number
  maxErrorEvents?: number
  maxMissingRequestIdEvents?: number
  maxP95SlowDurationMs?: number
}

interface CommunityTelemetryEvent {
  timestampMs: number
  name: CommunityTelemetryEventName
  operation: string
  durationMs: number
  hasRequestId: boolean
}

export interface ParsedCommunityTelemetry {
  nonEmptyLineCount: number
  ignoredRecordCount: number
  events: CommunityTelemetryEvent[]
}

export interface CommunityTelemetryOperationSummary {
  operation: string
  slowEventCount: number
  errorEventCount: number
}

export interface CommunityTelemetryDurationSummary {
  minMs: number
  medianMs: number
  p95Ms: number
  maxMs: number
}

export interface CommunityTelemetryReport {
  nonEmptyLineCount: number
  ignoredRecordCount: number
  communityEventCount: number
  firstEventAt: string | null
  lastEventAt: string | null
  slowEventCount: number
  errorEventCount: number
  missingRequestIdEventCount: number
  slowDuration: CommunityTelemetryDurationSummary | null
  operations: CommunityTelemetryOperationSummary[]
}

export interface CommunityTelemetryBudgetEvaluation {
  passed: boolean
  violations: string[]
}

const COMMUNITY_EVENTS = new Set<CommunityTelemetryEventName>([
  "community_operation_slow",
  "community_service_error",
])
const CONTEXT_KEYS = ["access", "mode", "operation", "outcome"]
const OUTCOMES = new Set(["completed", "rejected", "failed"])
const SAFE_OPERATION = /^[a-z][a-z-]{0,63}$/
const SAFE_REQUEST_ID = /^[A-Za-z0-9:._ -]{1,128}$/
const MAX_BUDGET_COUNT = 100_000
const MAX_BUDGET_DURATION_MS = 86_400_000
export const COMMUNITY_TELEMETRY_MAX_NON_EMPTY_LINES = 100_000

/**
 * Parse the application's default, newline-delimited structured-log output.
 * The caller deliberately receives no raw record fields other than the fixed,
 * Community-owned telemetry contract.
 */
export function parseCommunityTelemetryNdjson(source: string): ParsedCommunityTelemetry {
  const events: CommunityTelemetryEvent[] = []
  let nonEmptyLineCount = 0
  let ignoredRecordCount = 0

  for (const [index, line] of source.split(/\r?\n/).entries()) {
    if (!line.trim()) continue
    nonEmptyLineCount += 1
    if (nonEmptyLineCount > COMMUNITY_TELEMETRY_MAX_NON_EMPTY_LINES) {
      throw new Error(
        `input must contain at most ${COMMUNITY_TELEMETRY_MAX_NON_EMPTY_LINES} non-empty JSON lines`,
      )
    }
    const lineNumber = index + 1
    let value: unknown
    try {
      value = JSON.parse(line)
    } catch {
      throw new Error(`input contains invalid JSON on line ${lineNumber}`)
    }
    const record = asRecord(value)
    if (!record) throw new Error(`input contains a non-object record on line ${lineNumber}`)
    if (!isCommunityEventName(record.event)) {
      ignoredRecordCount += 1
      continue
    }
    events.push(parseCommunityTelemetryEvent(record, lineNumber))
  }

  return { nonEmptyLineCount, ignoredRecordCount, events }
}

export function summarizeCommunityTelemetry(
  parsed: ParsedCommunityTelemetry,
): CommunityTelemetryReport {
  const slowEvents = parsed.events.filter((event) => event.name === "community_operation_slow")
  const errorEvents = parsed.events.filter((event) => event.name === "community_service_error")
  const timestamps = parsed.events.map((event) => event.timestampMs)
  const operationCounts = new Map<string, CommunityTelemetryOperationSummary>()

  for (const event of parsed.events) {
    const summary = operationCounts.get(event.operation) ?? {
      operation: event.operation,
      slowEventCount: 0,
      errorEventCount: 0,
    }
    if (event.name === "community_operation_slow") summary.slowEventCount += 1
    else summary.errorEventCount += 1
    operationCounts.set(event.operation, summary)
  }

  return {
    nonEmptyLineCount: parsed.nonEmptyLineCount,
    ignoredRecordCount: parsed.ignoredRecordCount,
    communityEventCount: parsed.events.length,
    firstEventAt: timestamps.length ? new Date(Math.min(...timestamps)).toISOString() : null,
    lastEventAt: timestamps.length ? new Date(Math.max(...timestamps)).toISOString() : null,
    slowEventCount: slowEvents.length,
    errorEventCount: errorEvents.length,
    missingRequestIdEventCount: parsed.events.filter((event) => !event.hasRequestId).length,
    slowDuration: slowEvents.length
      ? summarizeCommunityTelemetryDurations(slowEvents.map((event) => event.durationMs))
      : null,
    operations: [...operationCounts.values()].sort((left, right) =>
      left.operation.localeCompare(right.operation),
    ),
  }
}

/**
 * Operator budgets intentionally default to observation-only. They apply to
 * the supplied export as a whole, whose time window belongs in the export
 * procedure rather than being inferred from unrelated platform metadata.
 */
export function evaluateCommunityTelemetryBudget(
  options: CommunityTelemetryOptions,
  report: CommunityTelemetryReport,
): CommunityTelemetryBudgetEvaluation {
  const violations: string[] = []
  if (options.maxSlowEvents !== undefined && report.slowEventCount > options.maxSlowEvents) {
    violations.push(`slow event count ${report.slowEventCount} exceeds ${options.maxSlowEvents}`)
  }
  if (options.maxErrorEvents !== undefined && report.errorEventCount > options.maxErrorEvents) {
    violations.push(`error event count ${report.errorEventCount} exceeds ${options.maxErrorEvents}`)
  }
  if (
    options.maxMissingRequestIdEvents !== undefined &&
    report.missingRequestIdEventCount > options.maxMissingRequestIdEvents
  ) {
    violations.push(
      `events without request ID ${report.missingRequestIdEventCount} exceeds ${options.maxMissingRequestIdEvents}`,
    )
  }
  if (
    options.maxP95SlowDurationMs !== undefined &&
    report.slowDuration &&
    report.slowDuration.p95Ms > options.maxP95SlowDurationMs
  ) {
    violations.push(
      `slow-operation p95 ${report.slowDuration.p95Ms} ms exceeds ${options.maxP95SlowDurationMs} ms`,
    )
  }
  return { passed: violations.length === 0, violations }
}

export function parseCommunityTelemetryArguments(argv: string[]): CommunityTelemetryOptions {
  let inputPath = ""
  let maxSlowEvents: number | undefined
  let maxErrorEvents: number | undefined
  let maxMissingRequestIdEvents: number | undefined
  let maxP95SlowDurationMs: number | undefined
  const seen = new Set<string>()

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    if (!flag?.startsWith("--")) throw new Error(`Unknown argument: ${String(flag)}`)
    if (seen.has(flag)) throw new Error(`Duplicate argument: ${flag}`)
    seen.add(flag)

    const value = argv[index + 1]
    if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`)
    index += 1

    if (flag === "--input") inputPath = value
    else if (flag === "--max-slow-events") {
      maxSlowEvents = parseBoundedInteger(value, flag, 0, MAX_BUDGET_COUNT)
    } else if (flag === "--max-error-events") {
      maxErrorEvents = parseBoundedInteger(value, flag, 0, MAX_BUDGET_COUNT)
    } else if (flag === "--max-missing-request-id-events") {
      maxMissingRequestIdEvents = parseBoundedInteger(value, flag, 0, MAX_BUDGET_COUNT)
    } else if (flag === "--max-p95-slow-duration-ms") {
      maxP95SlowDurationMs = parseBoundedInteger(value, flag, 0, MAX_BUDGET_DURATION_MS)
    } else throw new Error(`Unknown argument: ${flag}`)
  }

  if (!inputPath.trim()) throw new Error("--input is required")
  return {
    inputPath,
    maxSlowEvents,
    maxErrorEvents,
    maxMissingRequestIdEvents,
    maxP95SlowDurationMs,
  }
}

function parseCommunityTelemetryEvent(
  record: Record<string, unknown>,
  lineNumber: number,
): CommunityTelemetryEvent {
  const name = record.event as CommunityTelemetryEventName
  const timestamp = requiredString(record, "timestamp", lineNumber)
  const timestampMs = Date.parse(timestamp)
  if (!Number.isFinite(timestampMs) || new Date(timestampMs).toISOString() !== timestamp) {
    throw invalidRecord(lineNumber, "timestamp")
  }

  const expectedLevel = name === "community_operation_slow" ? "warn" : "error"
  if (record.level !== expectedLevel) throw invalidRecord(lineNumber, "level")
  if (record.provider !== "community") throw invalidRecord(lineNumber, "provider")
  if (record.route !== "/community") throw invalidRecord(lineNumber, "route")

  const durationMs = record.duration_ms
  if (
    typeof durationMs !== "number" ||
    !Number.isSafeInteger(durationMs) ||
    durationMs < 0 ||
    (name === "community_operation_slow" && durationMs < 1_000)
  ) {
    throw invalidRecord(lineNumber, "duration")
  }

  const context = asRecord(record.context)
  if (!context || !hasExactContextKeys(context)) throw invalidRecord(lineNumber, "context fields")
  const operation = requiredString(context, "operation", lineNumber)
  if (!SAFE_OPERATION.test(operation)) throw invalidRecord(lineNumber, "operation")
  if (context.mode !== "read" && context.mode !== "write") throw invalidRecord(lineNumber, "mode")
  if (context.access !== "standard" && context.access !== "moderator") {
    throw invalidRecord(lineNumber, "access")
  }
  if (typeof context.outcome !== "string" || !OUTCOMES.has(context.outcome)) {
    throw invalidRecord(lineNumber, "outcome")
  }
  if (record.status !== context.outcome) throw invalidRecord(lineNumber, "status")
  if (name === "community_service_error" && context.outcome !== "failed") {
    throw invalidRecord(lineNumber, "error outcome")
  }

  const requestId = record.request_id
  if (
    requestId !== undefined &&
    (typeof requestId !== "string" || !SAFE_REQUEST_ID.test(requestId))
  ) {
    throw invalidRecord(lineNumber, "request ID")
  }

  return {
    timestampMs,
    name,
    operation,
    durationMs,
    hasRequestId: requestId !== undefined,
  }
}

function summarizeCommunityTelemetryDurations(values: number[]): CommunityTelemetryDurationSummary {
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  const medianMs =
    sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!
  const p95Index = Math.max(0, Math.ceil(sorted.length * 0.95) - 1)

  return {
    minMs: sorted[0]!,
    medianMs,
    p95Ms: sorted[p95Index]!,
    maxMs: sorted.at(-1)!,
  }
}

function isCommunityEventName(value: unknown): value is CommunityTelemetryEventName {
  return typeof value === "string" && COMMUNITY_EVENTS.has(value as CommunityTelemetryEventName)
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function requiredString(record: Record<string, unknown>, key: string, lineNumber: number): string {
  const value = record[key]
  if (typeof value !== "string" || !value) throw invalidRecord(lineNumber, key)
  return value
}

function hasExactContextKeys(context: Record<string, unknown>): boolean {
  const keys = Object.keys(context).sort()
  return (
    keys.length === CONTEXT_KEYS.length && keys.every((key, index) => key === CONTEXT_KEYS[index])
  )
}

function invalidRecord(lineNumber: number, field: string): Error {
  return new Error(`Community telemetry record has an invalid ${field} on line ${lineNumber}`)
}

function parseBoundedInteger(
  value: string,
  flag: string,
  minimum: number,
  maximum: number,
): number {
  if (!/^\d+$/.test(value)) throw new Error(`${flag} must be an integer`)
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${flag} must be between ${minimum} and ${maximum}`)
  }
  return parsed
}
