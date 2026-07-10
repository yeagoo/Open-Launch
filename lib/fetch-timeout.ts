import { request, type Dispatcher } from "undici"

// Timeout for server-side HTTP that does NOT use global fetch streams.
//
// Node versions before 24.15.0 had a TransformStream cancel/write race that
// could crash unrelated SSR renders. Production is now pinned past that fix,
// but server jobs still use Node-readable undici.request bodies so timeout
// handling stays independent from the framework's web-stream rendering path.
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
  arrayBuffer(): Promise<ArrayBuffer>
  text(): Promise<string>
  // Mirrors lib.dom's Response.json() shape so existing callers keep inference.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  json<T = any>(): Promise<T>
}

type FetchWithTimeoutInit = Omit<RequestInit, "body" | "signal"> & {
  body?: RequestInit["body"] | Dispatcher.DispatchOptions["body"] | null
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])
const MAX_REDIRECTS = 5

export function fetchWithTimeout(
  input: string | URL,
  init: FetchWithTimeoutInit,
  timeoutMs: number,
  label = "request",
): Promise<FetchWithTimeoutResponse> {
  return withTimeout(
    requestWithRedirects(input, init, timeoutMs, label).then(toFetchWithTimeoutResponse),
    timeoutMs,
    label,
  )
}

async function requestWithRedirects(
  input: string | URL,
  init: FetchWithTimeoutInit,
  timeoutMs: number,
  label: string,
): Promise<Awaited<ReturnType<typeof request>>> {
  const deadline = Date.now() + timeoutMs
  let currentUrl = new URL(input.toString())
  let method = init.method ?? "GET"
  let body = normalizeRequestBody(init.body)
  let headers = normalizeHeaders(init.headers)

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const remaining = Math.max(1, deadline - Date.now())
    const response = await request(currentUrl, {
      method,
      headers,
      body,
      headersTimeout: remaining,
      bodyTimeout: remaining,
    })

    const location = headerValue(response.headers.location)
    if (!REDIRECT_STATUSES.has(response.statusCode) || !location || init.redirect === "manual") {
      return response
    }

    if (init.redirect === "error") {
      await drainResponseBody(response, remaining, label)
      throw new Error(`${label} redirected with HTTP ${response.statusCode}`)
    }

    if (hop === MAX_REDIRECTS) {
      await drainResponseBody(response, remaining, label)
      throw new Error(`${label} redirected too many times`)
    }

    await drainResponseBody(response, remaining, label)
    const previousOrigin = currentUrl.origin
    currentUrl = new URL(location, currentUrl)
    if (currentUrl.origin !== previousOrigin) {
      headers = stripSensitiveRedirectHeaders(headers)
    }
    if (
      response.statusCode === 303 ||
      ((response.statusCode === 301 || response.statusCode === 302) &&
        method.toUpperCase() === "POST")
    ) {
      method = "GET"
      body = null
      headers = stripBodyHeaders(headers)
    }
  }

  throw new Error(`${label} redirected too many times`)
}

async function drainResponseBody(
  response: Awaited<ReturnType<typeof request>>,
  timeoutMs: number,
  label: string,
): Promise<void> {
  await withTimeout(response.body.text(), timeoutMs, `${label} redirect body`).catch(() => {})
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

function stripSensitiveRedirectHeaders(headers: Record<string, string>): Record<string, string> {
  const next = { ...headers }
  delete next.authorization
  delete next.cookie
  delete next["proxy-authorization"]
  return next
}

function stripBodyHeaders(headers: Record<string, string>): Record<string, string> {
  const next = { ...headers }
  delete next["content-length"]
  delete next["content-type"]
  return next
}

function toFetchWithTimeoutResponse(
  response: Awaited<ReturnType<typeof request>>,
): FetchWithTimeoutResponse {
  let consumed = false
  async function readArrayBuffer(): Promise<ArrayBuffer> {
    if (consumed) throw new Error("Response body already consumed")
    consumed = true
    return response.body.arrayBuffer()
  }

  async function readText(): Promise<string> {
    const buffer = await readArrayBuffer()
    return new TextDecoder().decode(buffer)
  }

  return {
    ok: response.statusCode >= 200 && response.statusCode < 300,
    status: response.statusCode,
    statusText: response.statusText,
    headers: undiciHeadersToHeaders(response.headers),
    arrayBuffer: readArrayBuffer,
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

function headerValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}
