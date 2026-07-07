import { request, type Dispatcher } from "undici"

// Timeout for server-side HTTP that does NOT use global fetch streams.
//
// Aborting/cancelling a fetch-returned ReadableStream while undici is still
// wiring up its internal Transform corrupts a process-wide web-streams pool,
// after which unrelated SSR renders crash with
// `controller[kState].transformAlgorithm is not a function` (see safe-fetch.ts).
// Reproduced in prod on Node 22.23.0 during crawl-heavy crons, where
// `AbortSignal.timeout` firing mid-wiring was the trigger.
//
// Server call sites use `undici.request` through `fetchWithTimeout` below.
// Instead of aborting on timeout, we race the request/body read against a timer
// and, on timeout, abandon that promise. Abandoning — unlike cancelling a
// global-fetch ReadableStream — does not hit the wiring race.

export class FetchTimeoutError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "FetchTimeoutError"
  }
}

/**
 * Race any promise against a timer WITHOUT aborting it. On timeout the promise
 * is abandoned (its result/body is never read and gets GC'd) — abandoning,
 * unlike cancelling, does not corrupt undici's stream pool. Use this to bound
 * body reads (`.json()` / `.text()`) too: a fetch can resolve its headers fast
 * and then stall the body, so the read needs its own deadline.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label = "operation",
): Promise<T> {
  // The abandoned promise may settle after the timer wins; swallow a late
  // rejection so it doesn't surface as an unhandled rejection.
  promise.catch(() => {})

  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new FetchTimeoutError(`${label} timed out after ${timeoutMs}ms`)),
      timeoutMs,
    )
    // Don't let the timer keep the event loop alive on its own.
    timer.unref?.()
  })

  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}

export interface FetchWithTimeoutResponse {
  ok: boolean
  status: number
  statusText: string
  headers: Headers
  text(): Promise<string>
  // Mirrors lib.dom's Response.json() shape so existing callers keep inference.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  json<T = any>(): Promise<T>
}

type FetchWithTimeoutInit = Omit<RequestInit, "body" | "signal"> & {
  body?: RequestInit["body"] | Dispatcher.DispatchOptions["body"] | null
}

export function fetchWithTimeout(
  input: string | URL,
  init: FetchWithTimeoutInit,
  timeoutMs: number,
  label = "request",
): Promise<FetchWithTimeoutResponse> {
  return withTimeout(
    request(input, {
      method: init.method ?? "GET",
      headers: normalizeHeaders(init.headers),
      body: normalizeRequestBody(init.body),
      headersTimeout: timeoutMs,
      bodyTimeout: timeoutMs,
    }).then(toFetchWithTimeoutResponse),
    timeoutMs,
    label,
  )
}

function normalizeHeaders(headers: HeadersInit | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  if (!headers) return out

  new Headers(headers).forEach((value, key) => {
    out[key] = value
  })
  return out
}

function normalizeRequestBody(
  body: FetchWithTimeoutInit["body"],
): Dispatcher.DispatchOptions["body"] | null {
  if (body == null) return null
  return body as Dispatcher.DispatchOptions["body"]
}

function toFetchWithTimeoutResponse(
  response: Awaited<ReturnType<typeof request>>,
): FetchWithTimeoutResponse {
  let consumed = false
  async function readText(): Promise<string> {
    if (consumed) throw new Error("Response body already consumed")
    consumed = true
    return response.body.text()
  }

  return {
    ok: response.statusCode >= 200 && response.statusCode < 300,
    status: response.statusCode,
    statusText: response.statusText,
    headers: undiciHeadersToHeaders(response.headers),
    text: readText,
    // Mirrors lib.dom's Response.json() shape so existing callers keep inference.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    json: async <T = any>() => {
      const text = await readText()
      return (text ? JSON.parse(text) : null) as T
    },
  }
}

function undiciHeadersToHeaders(headers: Awaited<ReturnType<typeof request>>["headers"]): Headers {
  const out = new Headers()
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue
    if (Array.isArray(value)) {
      for (const item of value) out.append(key, item)
    } else {
      out.set(key, String(value))
    }
  }
  return out
}
