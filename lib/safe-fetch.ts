import dns from "node:dns/promises"
import type { LookupFunction } from "node:net"
import { Readable } from "node:stream"

import { Client, interceptors, request, type Dispatcher } from "undici"

import { isPrivateHostname } from "@/lib/utils"

/**
 * SSRF-hardened wrapper around `fetch`.
 *
 * What it does vs plain fetch:
 *   - Rejects non-http(s) protocols.
 *   - Rejects hostnames whose literal form is private/loopback/link-local
 *     (catches `localhost`, `127.0.0.1`, `169.254.169.254`, etc.).
 *   - DNS-resolves the hostname before each request and rejects when any
 *     resolved IP falls into a private range — covers cases where the
 *     hostname looks public but resolves to internal infra, AWS metadata,
 *     decimal/hex IPv4, IPv4-mapped IPv6, etc.
 *   - Pins the actual connect-time lookup to those already-validated records,
 *     closing the resolve→connect DNS rebinding window at the application
 *     layer.
 *   - Walks redirects manually (`redirect: "manual"`) and re-applies all
 *     of the above to every hop, so a public host can't 302 us into the
 *     internal network.
 *   - Enforces a default 10s timeout chained with the caller's signal.
 *
 * Use anywhere a user-supplied URL is fetched from server-side code.
 */
export type SafeFetchOptions = Omit<RequestInit, "redirect"> & {
  maxRedirects?: number
  timeoutMs?: number
}

const DEFAULT_MAX_REDIRECTS = 5
const DEFAULT_TIMEOUT_MS = 10_000
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])
const SAFE_FETCH_CLEANUP = Symbol("safeFetchCleanup")

type SafeDnsRecord = { address: string; family: number }
type UndiciResponse = Awaited<ReturnType<typeof request>>
type UndiciBody = UndiciResponse["body"]

interface SafeFetchCleanup {
  body: UndiciBody
  client: Client
  done: boolean
}

export class SafeFetchError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "protocol"
      | "private_host"
      | "private_resolved_ip"
      | "too_many_redirects"
      | "invalid_redirect"
      | "timeout"
      | "dns_failure",
  ) {
    super(message)
    this.name = "SafeFetchError"
  }
}

export async function safeFetch(
  input: string | URL,
  init: SafeFetchOptions = {},
): Promise<Response> {
  const maxRedirects = init.maxRedirects ?? DEFAULT_MAX_REDIRECTS
  const timeoutMs = init.timeoutMs ?? DEFAULT_TIMEOUT_MS
  // Deadline for the whole redirect chain. This uses undici.request with native
  // phase timeouts; do not move this back to global fetch + AbortSignal.
  const deadline = Date.now() + timeoutMs
  const callerSignal = init.signal as AbortSignal | undefined

  let currentUrl: URL
  try {
    currentUrl = typeof input === "string" ? new URL(input) : new URL(input.toString())
  } catch {
    throw new SafeFetchError("safeFetch: invalid URL", "protocol")
  }

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const records = await resolveSafeUrl(currentUrl)
    const remaining = deadline - Date.now()
    if (remaining <= 0) throw new SafeFetchError("safeFetch: timed out", "timeout")
    if (callerSignal?.aborted) throw callerSignal.reason

    const client = createPinnedClient(currentUrl, records, remaining)
    const dispatcher = createSafeFetchDispatcher(client)
    let response: UndiciResponse
    try {
      response = await request(currentUrl, {
        dispatcher,
        method: init.method ?? "GET",
        headers: normalizeHeaders(init.headers, currentUrl.protocol),
        body: normalizeRequestBody(init.body),
        signal: callerSignal,
        headersTimeout: remaining,
        bodyTimeout: remaining,
      })
    } catch (err) {
      void closeClient(client)
      if (isUndiciTimeout(err)) {
        throw new SafeFetchError("safeFetch: timed out", "timeout")
      }
      throw err
    }

    if (response.statusCode >= 300 && response.statusCode < 400) {
      const location = headerValue(response.headers.location)
      if (!location || !REDIRECT_STATUSES.has(response.statusCode)) {
        return toWebResponse(response, currentUrl, client)
      }

      discardUndiciBody(response.body)
      void closeClient(client)
      let nextUrl: URL
      try {
        nextUrl = new URL(location, currentUrl.toString())
      } catch {
        throw new SafeFetchError(
          `safeFetch: invalid redirect target "${location}"`,
          "invalid_redirect",
        )
      }
      currentUrl = nextUrl
      continue
    }

    return toWebResponse(response, currentUrl, client)
  }
  throw new SafeFetchError("safeFetch: too many redirects", "too_many_redirects")
}

export function closeSafeFetchResponse(response: Response): void {
  const cleanup = (response as Response & { [SAFE_FETCH_CLEANUP]?: SafeFetchCleanup })[
    SAFE_FETCH_CLEANUP
  ]
  if (!cleanup || cleanup.done) return

  cleanup.done = true
  discardUndiciBody(cleanup.body)
  void closeClient(cleanup.client)
}

async function resolveSafeUrl(url: URL): Promise<SafeDnsRecord[]> {
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new SafeFetchError(`safeFetch: protocol ${url.protocol} not allowed`, "protocol")
  }
  if (isPrivateHostname(url.hostname)) {
    throw new SafeFetchError(`safeFetch: hostname ${url.hostname} is private`, "private_host")
  }

  let records: SafeDnsRecord[]
  try {
    records = await dns.lookup(url.hostname, { all: true, verbatim: true })
  } catch (err) {
    throw new SafeFetchError(
      `safeFetch: DNS lookup for ${url.hostname} failed: ${(err as Error).message}`,
      "dns_failure",
    )
  }
  if (records.length === 0) {
    throw new SafeFetchError(
      `safeFetch: DNS lookup for ${url.hostname} returned no addresses`,
      "dns_failure",
    )
  }

  for (const record of records) {
    // Normalize IPv4-mapped IPv6 ("::ffff:127.0.0.1") so the IPv4 ranges
    // in isPrivateHostname still catch it.
    const addr = record.address.startsWith("::ffff:")
      ? record.address.slice("::ffff:".length)
      : record.address
    if (isPrivateHostname(addr)) {
      throw new SafeFetchError(
        `safeFetch: ${url.hostname} resolves to private address ${record.address}`,
        "private_resolved_ip",
      )
    }
  }

  return records
}

function createPinnedClient(
  url: URL,
  records: readonly SafeDnsRecord[],
  timeoutMs: number,
): Client {
  return new Client(url.origin, {
    connectTimeout: timeoutMs,
    bodyTimeout: timeoutMs,
    headersTimeout: timeoutMs,
    autoSelectFamily: true,
    autoSelectFamilyAttemptTimeout: Math.max(1, Math.min(250, timeoutMs)),
    connect: {
      lookup: createPinnedLookup(records),
    },
  })
}

function createSafeFetchDispatcher(client: Client): Dispatcher {
  return client.compose(
    interceptors.decompress({
      skipErrorResponses: false,
    }),
  )
}

function createPinnedLookup(records: readonly SafeDnsRecord[]): LookupFunction {
  return (_hostname, options, callback) => {
    if (options.all) {
      callback(
        null,
        records.map((record) => ({
          address: record.address,
          family: record.family,
        })),
      )
      return
    }

    const family = typeof options.family === "number" ? options.family : 0
    const record =
      family === 4 || family === 6
        ? (records.find((candidate) => candidate.family === family) ?? records[0])
        : records[0]
    callback(null, record.address, record.family)
  }
}

function normalizeHeaders(
  headers: HeadersInit | undefined,
  protocol: string,
): Record<string, string> {
  const normalized: Record<string, string> = {}

  if (headers) {
    new Headers(headers).forEach((value, key) => {
      normalized[key] = value
    })
  }
  if (!normalized["accept-encoding"]) {
    normalized["accept-encoding"] = protocol === "https:" ? "br, gzip, deflate" : "gzip, deflate"
  }
  return normalized
}

function normalizeRequestBody(
  body: BodyInit | null | undefined,
): Dispatcher.DispatchOptions["body"] {
  if (body == null) return null
  return body as Dispatcher.DispatchOptions["body"]
}

function toWebResponse(response: UndiciResponse, url: URL, client: Client): Response {
  const headers = undiciHeadersToHeaders(response.headers)
  const hasNullBody = response.statusCode === 204 || response.statusCode === 304

  if (hasNullBody) {
    discardUndiciBody(response.body)
    void closeClient(client)
    const webResponse = new Response(null, {
      status: response.statusCode,
      statusText: response.statusText,
      headers,
    })
    Object.defineProperty(webResponse, "url", { value: url.toString() })
    return webResponse
  }

  const cleanup: SafeFetchCleanup = {
    body: response.body,
    client,
    done: false,
  }
  const body = Readable.toWeb(response.body) as ReadableStream
  closeClientWhenBodyFinishes(cleanup)

  const webResponse = new Response(body, {
    status: response.statusCode,
    statusText: response.statusText,
    headers,
  })
  Object.defineProperty(webResponse, SAFE_FETCH_CLEANUP, { value: cleanup })
  Object.defineProperty(webResponse, "url", { value: url.toString() })
  return webResponse
}

function discardUndiciBody(body: UndiciBody): void {
  body.on("error", () => {
    // destroy() can asynchronously emit RequestAbortedError; that is expected
    // when intentionally abandoning redirect/null/early-return bodies.
  })
  body.destroy()
}

function undiciHeadersToHeaders(headers: UndiciResponse["headers"]): Headers {
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

function closeClientWhenBodyFinishes(cleanup: SafeFetchCleanup): void {
  const close = () => {
    if (cleanup.done) return
    cleanup.done = true
    void closeClient(cleanup.client)
  }
  const destroy = () => {
    if (cleanup.done) return
    cleanup.done = true
    cleanup.client.destroy()
  }

  cleanup.body.once("end", close)
  cleanup.body.once("close", close)
  cleanup.body.once("error", destroy)
}

async function closeClient(client: Client): Promise<void> {
  try {
    await client.close()
  } catch {
    client.destroy()
  }
}

function isUndiciTimeout(error: unknown): boolean {
  const code =
    typeof error === "object" && error !== null ? (error as { code?: unknown }).code : undefined
  return (
    code === "UND_ERR_CONNECT_TIMEOUT" ||
    code === "UND_ERR_HEADERS_TIMEOUT" ||
    code === "UND_ERR_BODY_TIMEOUT"
  )
}
