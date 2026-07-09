import { fetchWithTimeout, withTimeout } from "@/lib/fetch-timeout"

const DEFAULT_TIMEOUT_MS = 30_000
const MAX_LOGGED_STACKS = 50

const globalForFetchGuard = globalThis as typeof globalThis & {
  __aatOriginalFetch?: typeof fetch
  __aatServerFetchGuardRegistered?: boolean
  __aatServerFetchGuardStacks?: Set<string>
}

export function registerServerFetchGuard() {
  if (globalForFetchGuard.__aatServerFetchGuardRegistered) return
  if (typeof globalThis.fetch !== "function") return

  const originalFetch = globalThis.fetch.bind(globalThis)
  globalForFetchGuard.__aatOriginalFetch = originalFetch
  globalForFetchGuard.__aatServerFetchGuardRegistered = true
  globalForFetchGuard.__aatServerFetchGuardStacks = new Set()

  globalThis.fetch = async (input, init) => {
    const request = normalizeFetchRequest(input, init)
    if (!request) {
      return originalFetch(input, init)
    }

    logServerGlobalFetch(request.url, request.method, Boolean(request.signal))

    const timeoutMs = serverFetchTimeoutMs()
    const deadline = Date.now() + timeoutMs
    const response = await fetchWithTimeout(
      request.url,
      {
        method: request.method,
        headers: request.headers,
        body: request.body,
        redirect: request.redirect,
      },
      timeoutMs,
      `server global fetch ${request.url.origin}`,
    )

    const remaining = Math.max(1, deadline - Date.now())
    const body =
      request.method === "HEAD" || response.status === 204 || response.status === 304
        ? null
        : await withTimeout(
            response.arrayBuffer(),
            remaining,
            `server global fetch body ${request.url.origin}`,
          )

    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    })
  }
}

export function resetServerFetchGuardForTest() {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("resetServerFetchGuardForTest is only available in tests")
  }
  if (globalForFetchGuard.__aatOriginalFetch) {
    globalThis.fetch = globalForFetchGuard.__aatOriginalFetch
  }
  globalForFetchGuard.__aatOriginalFetch = undefined
  globalForFetchGuard.__aatServerFetchGuardRegistered = false
  globalForFetchGuard.__aatServerFetchGuardStacks = undefined
}

interface NormalizedFetchRequest {
  url: URL
  method: string
  headers: Headers
  body: BodyInit | null
  redirect: RequestRedirect | undefined
  signal: AbortSignal | null
}

function normalizeFetchRequest(
  input: Parameters<typeof fetch>[0],
  init: Parameters<typeof fetch>[1],
): NormalizedFetchRequest | null {
  const url = urlFromFetchInput(input)
  if (!url || (url.protocol !== "http:" && url.protocol !== "https:")) return null

  const inputRequest = typeof Request !== "undefined" && input instanceof Request ? input : null
  const method = init?.method ?? inputRequest?.method ?? "GET"
  const headers = new Headers(inputRequest?.headers)
  if (init?.headers) {
    new Headers(init.headers).forEach((value, key) => headers.set(key, value))
  }

  const body = normalizeBody(init?.body ?? null)
  const redirect = init?.redirect ?? inputRequest?.redirect
  const signal = init?.signal ?? inputRequest?.signal ?? null

  return {
    url,
    method,
    headers,
    body,
    redirect,
    signal,
  }
}

function urlFromFetchInput(input: Parameters<typeof fetch>[0]): URL | null {
  try {
    if (typeof input === "string" || input instanceof URL) return new URL(input)
    if (typeof Request !== "undefined" && input instanceof Request) return new URL(input.url)
  } catch {
    return null
  }
  return null
}

function normalizeBody(body: BodyInit | null): BodyInit | null {
  if (!body) return null
  if (typeof ReadableStream !== "undefined" && body instanceof ReadableStream) {
    throw new Error("server global fetch guard does not support streaming request bodies")
  }
  return body
}

function serverFetchTimeoutMs(): number {
  const raw = Number(process.env.AAT_SERVER_GLOBAL_FETCH_TIMEOUT_MS)
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TIMEOUT_MS
}

function logServerGlobalFetch(url: URL, method: string, hasSignal: boolean) {
  const stacks = globalForFetchGuard.__aatServerFetchGuardStacks
  if (!stacks || stacks.size >= MAX_LOGGED_STACKS) return

  const stack = stackSummary()
  const key = `${url.origin}|${method}|${stack.join("|")}`
  if (stacks.has(key)) return
  stacks.add(key)

  console.warn(
    "[server-global-fetch]",
    JSON.stringify({
      url: sanitizeUrl(url),
      method,
      hasSignal,
      stack,
    }),
  )
}

function stackSummary(): string[] {
  const stack = new Error().stack
  if (!stack) return []
  return stack
    .split("\n")
    .slice(2)
    .map((line) => line.trim())
    .filter((line) => line && !line.includes("server-fetch-guard"))
    .slice(0, 6)
}

function sanitizeUrl(url: URL): string {
  const clone = new URL(url)
  for (const key of Array.from(clone.searchParams.keys())) {
    clone.searchParams.set(key, "[redacted]")
  }
  return clone.toString()
}
