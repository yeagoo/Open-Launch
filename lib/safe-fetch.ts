import dns from "node:dns/promises"

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

  const controller = new AbortController()
  const callerSignal = init.signal as AbortSignal | undefined
  if (callerSignal) {
    if (callerSignal.aborted) controller.abort(callerSignal.reason)
    else
      callerSignal.addEventListener("abort", () => controller.abort(callerSignal.reason), {
        once: true,
      })
  }
  const timer = setTimeout(
    () => controller.abort(new SafeFetchError("safeFetch: timed out", "timeout")),
    timeoutMs,
  )

  try {
    let currentUrl: URL
    try {
      currentUrl = typeof input === "string" ? new URL(input) : new URL(input.toString())
    } catch {
      throw new SafeFetchError("safeFetch: invalid URL", "protocol")
    }

    for (let hop = 0; hop <= maxRedirects; hop++) {
      await assertSafeUrl(currentUrl)
      const response = await fetch(currentUrl.toString(), {
        ...init,
        signal: controller.signal,
        redirect: "manual",
      })

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location")
        if (!location) return response

        // Intentionally NOT calling `response.body.cancel()` on the
        // intermediate redirect responses. Under Node 24 + undici,
        // cancelling a fetch-returned ReadableStream while undici is
        // still wiring up its internal Transform corrupts a process-
        // wide stream pool, after which unrelated SSR streams crash
        // with `controller[kState].transformAlgorithm is not a
        // function` (digest repeats forever). The intermediate body
        // is small and gets GC'd on its own once we abandon the
        // reference — the few extra bytes per hop are cheaper than
        // losing the worker.

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

      return response
    }
    throw new SafeFetchError("safeFetch: too many redirects", "too_many_redirects")
  } finally {
    clearTimeout(timer)
  }
}

async function assertSafeUrl(url: URL): Promise<void> {
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new SafeFetchError(`safeFetch: protocol ${url.protocol} not allowed`, "protocol")
  }
  if (isPrivateHostname(url.hostname)) {
    throw new SafeFetchError(`safeFetch: hostname ${url.hostname} is private`, "private_host")
  }

  let records: { address: string; family: number }[]
  try {
    records = await dns.lookup(url.hostname, { all: true, verbatim: true })
  } catch (err) {
    throw new SafeFetchError(
      `safeFetch: DNS lookup for ${url.hostname} failed: ${(err as Error).message}`,
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
}
