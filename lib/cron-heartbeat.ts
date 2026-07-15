import { fetchWithTimeout, withTimeout, type FetchWithTimeoutResponse } from "./fetch-timeout"

const HEARTBEAT_TIMEOUT_MS = 5_000
const MIN_RETRY_MS = 60_000
const MAX_RETRY_MS = 30 * 60_000
const MAX_ERROR_LENGTH = 400

export interface CronHeartbeatState {
  consecutiveFailures: number
  nextAttemptAt: number
}

export type CronHeartbeatResult =
  | { status: "ok" }
  | { status: "skipped"; retryAt: string }
  | { status: "failed"; retryAt: string; error: string }

interface HeartbeatDependencies {
  now?: () => number
  request?: (url: string, timeoutMs: number) => Promise<FetchWithTimeoutResponse>
  warn?: (message: string) => void
}

export async function pingCronHeartbeat(
  url: string,
  state: CronHeartbeatState,
  dependencies: HeartbeatDependencies = {},
): Promise<CronHeartbeatResult> {
  const now = dependencies.now?.() ?? Date.now()
  if (now < state.nextAttemptAt) {
    return { status: "skipped", retryAt: new Date(state.nextAttemptAt).toISOString() }
  }

  try {
    const parsed = new URL(url)
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new Error(`unsupported heartbeat protocol ${parsed.protocol}`)
    }

    const deadline = now + HEARTBEAT_TIMEOUT_MS
    const request =
      dependencies.request ??
      ((target: string, timeoutMs: number) =>
        fetchWithTimeout(target, { method: "GET" }, timeoutMs, "cron heartbeat"))
    const response = await request(parsed.toString(), HEARTBEAT_TIMEOUT_MS)
    await withTimeout(
      response.text(),
      Math.max(1, deadline - (dependencies.now?.() ?? Date.now())),
      "cron heartbeat body",
    ).catch(() => "")

    if (!response.ok) {
      throw new Error(`heartbeat endpoint returned HTTP ${response.status}`)
    }

    state.consecutiveFailures = 0
    state.nextAttemptAt = 0
    return { status: "ok" }
  } catch (error) {
    state.consecutiveFailures++
    const retryMs = heartbeatRetryDelay(state.consecutiveFailures)
    state.nextAttemptAt = now + retryMs
    const summary = summarizeHeartbeatError(error)
    const retryAt = new Date(state.nextAttemptAt).toISOString()
    ;(dependencies.warn ?? console.warn)(
      `[cron-heartbeat] ping failed (${state.consecutiveFailures} consecutive); retry at ${retryAt}: ${summary}`,
    )
    return { status: "failed", retryAt, error: summary }
  }
}

export function heartbeatRetryDelay(consecutiveFailures: number): number {
  const exponent = Math.max(0, Math.min(20, consecutiveFailures - 1))
  return Math.min(MAX_RETRY_MS, MIN_RETRY_MS * 2 ** exponent)
}

export function summarizeHeartbeatError(error: unknown): string {
  const messages: string[] = []
  const seen = new Set<unknown>()

  const visit = (value: unknown, depth: number) => {
    if (depth > 5 || value == null || seen.has(value)) return
    seen.add(value)

    if (value instanceof AggregateError) {
      if (value.message) messages.push(value.message)
      for (const nested of value.errors.slice(0, 4)) visit(nested, depth + 1)
      visit(value.cause, depth + 1)
      return
    }

    if (value instanceof Error) {
      const code = (value as NodeJS.ErrnoException).code
      messages.push(`${code ? `${code} ` : ""}${value.name}: ${value.message}`)
      visit((value as Error & { cause?: unknown }).cause, depth + 1)
      return
    }

    messages.push(String(value))
  }

  visit(error, 0)
  const summary = [...new Set(messages)]
    .join(" | ")
    .replace(/[\r\n\t]+/g, " ")
    .trim()
  const safe = summary || "unknown heartbeat error"
  return safe.length > MAX_ERROR_LENGTH ? `${safe.slice(0, MAX_ERROR_LENGTH)}...` : safe
}
