import dns from "node:dns/promises"
import type { LookupFunction } from "node:net"

import { Client, interceptors, request, type Dispatcher } from "undici"

import { isPrivateHostname } from "@/lib/utils"

/**
 * SSRF-hardened fetch-like wrapper backed by `undici.request`.
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
 *   - Enforces a default 10s timeout through undici's phase timeouts.
 *   - Never wraps the undici body in WebStreams/Response; that path is the
 *     Node 22 production crash trigger this helper exists to avoid.
 *
 * Use anywhere a user-supplied URL is fetched from server-side code.
 */
export type SafeFetchOptions = Omit<RequestInit, "redirect" | "signal"> & {
  maxRedirects?: number
  timeoutMs?: number
}

export interface SafeFetchResponse {
  ok: boolean
  status: number
  statusText: string
  headers: Headers
  url: string
  text(): Promise<string>
  arrayBuffer(): Promise<ArrayBuffer>
  // Mirrors lib.dom's Response.json() shape so existing callers keep inference.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  json<T = any>(): Promise<T>
}

export interface ReadSafeFetchTextOptions {
  deadline?: number
  maxBytes?: number
  stopAfterHead?: boolean
  label?: string
}

export interface ReadSafeFetchBufferOptions {
  deadline?: number
  maxBytes?: number
  label?: string
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
): Promise<SafeFetchResponse> {
  const maxRedirects = init.maxRedirects ?? DEFAULT_MAX_REDIRECTS
  const timeoutMs = init.timeoutMs ?? DEFAULT_TIMEOUT_MS
  // Deadline for the whole redirect chain. This uses undici.request with native
  // phase timeouts; do not move this back to global fetch + AbortSignal.
  const deadline = Date.now() + timeoutMs

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

    const client = createPinnedClient(currentUrl, records, remaining)
    const dispatcher = createSafeFetchDispatcher(client)
    let response: UndiciResponse
    try {
      response = await request(currentUrl, {
        dispatcher,
        method: init.method ?? "GET",
        headers: normalizeHeaders(init.headers, currentUrl.protocol),
        body: normalizeRequestBody(init.body),
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
        return toSafeFetchResponse(response, currentUrl, client)
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

    return toSafeFetchResponse(response, currentUrl, client)
  }
  throw new SafeFetchError("safeFetch: too many redirects", "too_many_redirects")
}

export function closeSafeFetchResponse(response: SafeFetchResponse): void {
  const cleanup = getSafeFetchCleanup(response)
  if (!cleanup || cleanup.done) return

  cleanup.done = true
  discardUndiciBody(cleanup.body)
  void closeClient(cleanup.client)
}

export async function readSafeFetchText(
  response: SafeFetchResponse,
  options: ReadSafeFetchTextOptions = {},
): Promise<string> {
  const cleanup = getSafeFetchCleanup(response)
  if (!cleanup) {
    const text = await response.text()
    return boundFallbackText(text, options)
  }

  return consumeSafeFetchBody(cleanup, async (body) => {
    const result = await readUndiciBodyText(body, options)
    return {
      value: result.text,
      stoppedEarly: result.stoppedEarly,
    }
  })
}

export async function readSafeFetchBuffer(
  response: SafeFetchResponse,
  options: ReadSafeFetchBufferOptions = {},
): Promise<Buffer> {
  const cleanup = getSafeFetchCleanup(response)
  if (!cleanup) {
    const buffer = Buffer.from(await response.arrayBuffer())
    enforceBufferByteLimit(buffer.byteLength, options.maxBytes, options)
    return buffer
  }

  return consumeSafeFetchBody(cleanup, async (body) => {
    const buffer = await readUndiciBodyBuffer(body, options)
    return {
      value: buffer,
      stoppedEarly: false,
    }
  })
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

function toSafeFetchResponse(
  response: UndiciResponse,
  url: URL,
  client: Client,
): SafeFetchResponse {
  const headers = undiciHeadersToHeaders(response.headers)
  const hasNullBody = response.statusCode === 204 || response.statusCode === 304

  if (hasNullBody) {
    discardUndiciBody(response.body)
    void closeClient(client)
    return createNullBodyResponse(response, url, headers)
  }

  const cleanup: SafeFetchCleanup = {
    body: response.body,
    client,
    done: false,
  }

  const safeResponse: SafeFetchResponse = {
    ok: response.statusCode >= 200 && response.statusCode < 300,
    status: response.statusCode,
    statusText: response.statusText,
    headers,
    url: url.toString(),
    text: () =>
      consumeSafeFetchBody(cleanup, async (body) => ({
        value: (await readUndiciBodyText(body)).text,
        stoppedEarly: false,
      })),
    arrayBuffer: () =>
      consumeSafeFetchBody(cleanup, async (body) => {
        const buffer = await readUndiciBodyBuffer(body)
        return {
          value: bufferToArrayBuffer(buffer),
          stoppedEarly: false,
        }
      }),
    json: async <T = unknown>() => {
      const text = await safeResponse.text()
      return (text ? JSON.parse(text) : null) as T
    },
  }
  Object.defineProperty(safeResponse, SAFE_FETCH_CLEANUP, { value: cleanup })
  return safeResponse
}

function createNullBodyResponse(
  response: UndiciResponse,
  url: URL,
  headers: Headers,
): SafeFetchResponse {
  return {
    ok: response.statusCode >= 200 && response.statusCode < 300,
    status: response.statusCode,
    statusText: response.statusText,
    headers,
    url: url.toString(),
    text: async () => "",
    arrayBuffer: async () => new ArrayBuffer(0),
    json: async <T = unknown>() => null as T,
  }
}

async function consumeSafeFetchBody<T>(
  cleanup: SafeFetchCleanup,
  read: (body: UndiciBody) => Promise<{ value: T; stoppedEarly: boolean }>,
): Promise<T> {
  if (cleanup.done) throw new Error("Response body already consumed")
  cleanup.done = true

  try {
    const result = await read(cleanup.body)
    if (result.stoppedEarly) {
      discardUndiciBody(cleanup.body)
      cleanup.client.destroy()
    } else {
      await closeClient(cleanup.client)
    }
    return result.value
  } catch (error) {
    discardUndiciBody(cleanup.body)
    cleanup.client.destroy()
    throw error
  }
}

async function readUndiciBodyBuffer(
  body: UndiciBody,
  options: ReadSafeFetchBufferOptions = {},
): Promise<Buffer> {
  const chunks: Buffer[] = []
  let bytes = 0

  for await (const chunk of body) {
    checkReadDeadline(options)
    const buffer = chunkToBuffer(chunk)
    bytes += buffer.byteLength
    enforceBufferByteLimit(bytes, options.maxBytes, options)
    chunks.push(buffer)
  }
  return Buffer.concat(chunks)
}

async function readUndiciBodyText(
  body: UndiciBody,
  options: ReadSafeFetchTextOptions = {},
): Promise<{ text: string; stoppedEarly: boolean }> {
  const decoder = new TextDecoder()
  const maxBytes = options.maxBytes
  let bytes = 0
  let text = ""

  for await (const chunk of body) {
    checkReadDeadline(options)

    const buffer = chunkToBuffer(chunk)
    bytes += buffer.byteLength
    text += decoder.decode(buffer, { stream: true })

    const headClose = options.stopAfterHead ? text.match(/<\/head\s*>/i) : null
    if (headClose?.index !== undefined) {
      const headEnd = headClose.index + headClose[0].length
      const headText = text.slice(0, headEnd) + decoder.decode()
      enforceTextByteLimit(headText, maxBytes, options)
      return { text: headText, stoppedEarly: true }
    }

    if (maxBytes && bytes > maxBytes) {
      throw new Error(byteLimitMessage(options, maxBytes))
    }
  }

  checkReadDeadline(options)
  text += decoder.decode()
  enforceTextByteLimit(text, maxBytes, options)
  return { text, stoppedEarly: false }
}

function checkReadDeadline(options: ReadSafeFetchTextOptions): void {
  if (options.deadline && Date.now() > options.deadline) {
    throw new Error(`${options.label ?? "response body"} timed out`)
  }
}

function enforceTextByteLimit(
  text: string,
  maxBytes: number | undefined,
  options: ReadSafeFetchTextOptions = {},
): void {
  if (!maxBytes) return
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new Error(byteLimitMessage(options, maxBytes))
  }
}

function byteLimitMessage(options: ReadSafeFetchTextOptions, maxBytes: number): string {
  const label = options.label ? options.label.replace(/\s+body$/i, "") : "Response"
  return `${label} exceeded ${maxBytes} bytes`
}

function enforceBufferByteLimit(
  bytes: number,
  maxBytes: number | undefined,
  options: ReadSafeFetchBufferOptions = {},
): void {
  if (!maxBytes) return
  if (bytes > maxBytes) {
    const label = options.label ? options.label.replace(/\s+body$/i, "") : "Response"
    throw new Error(`${label} exceeded ${maxBytes} bytes`)
  }
}

function boundFallbackText(text: string, options: ReadSafeFetchTextOptions): string {
  const headClose = options.stopAfterHead ? text.match(/<\/head\s*>/i) : null
  const bounded =
    headClose?.index !== undefined ? text.slice(0, headClose.index + headClose[0].length) : text
  enforceTextByteLimit(bounded, options.maxBytes, options)
  return bounded
}

function chunkToBuffer(chunk: unknown): Buffer {
  if (Buffer.isBuffer(chunk)) return chunk
  if (typeof chunk === "string") return Buffer.from(chunk)
  if (chunk instanceof Uint8Array) return Buffer.from(chunk)
  return Buffer.from(String(chunk))
}

function bufferToArrayBuffer(buffer: Buffer): ArrayBuffer {
  const start = buffer.byteOffset
  const end = start + buffer.byteLength
  return buffer.buffer.slice(start, end) as ArrayBuffer
}

function getSafeFetchCleanup(response: SafeFetchResponse): SafeFetchCleanup | undefined {
  return (response as SafeFetchResponse & { [SAFE_FETCH_CLEANUP]?: SafeFetchCleanup })[
    SAFE_FETCH_CLEANUP
  ]
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
