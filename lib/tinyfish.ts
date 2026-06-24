/**
 * Tinyfish Fetch API client.
 *
 * Tinyfish renders pages in a real browser (JS / SPA support) and returns
 * clean markdown. The Fetch endpoint is free on every plan — no credits
 * consumed — and limited to 25 URLs/min. Failed URLs don't count against
 * the rate limit.
 *
 * Docs: https://docs.tinyfish.ai/fetch-api
 */

import { request, type Dispatcher } from "undici"

import { CrawlError, type CrawlOptions, type CrawlResult } from "./crawler-types"
import { RateLimiter } from "./rate-limiter"

// Tinyfish Fetch caps free tier at 25 URLs/min. The limiter queues bursts
// in FIFO order so callers wait for a slot instead of hitting 429.
// Module-level singleton; shared across all callers in this process.
const fetchLimiter = new RateLimiter(25, 60_000)

export const tinyfishFetchLimiter = fetchLimiter // exported for /admin observability

// Read at call time so tests can swap env via vi.stubEnv and ops can flip
// keys without a redeploy.
function getConfig() {
  return {
    baseUrl: process.env.TINYFISH_BASE_URL ?? "https://api.fetch.tinyfish.ai",
    apiKey: process.env.TINYFISH_API_KEY,
  }
}

interface TinyfishResponse {
  results?: Array<{
    url: string
    final_url?: string
    title?: string
    description?: string
    language?: string
    text?: string
  }>
  errors?: Array<{ url: string; error: string }>
}

export async function tinyfishCrawl(url: string, options?: CrawlOptions): Promise<CrawlResult> {
  const { baseUrl, apiKey } = getConfig()
  if (!apiKey) {
    throw new CrawlError(url, "TINYFISH_API_KEY environment variable is not set")
  }

  const timeout = options?.timeout ?? 60_000

  // Two-phase budget:
  //   - Queue wait (acquire): up to 2 min — long enough to drain a 30-call
  //     burst (~60s after first window expires) without rejecting tail
  //     calls, but bounded so a runaway producer doesn't pile up forever.
  //   - Network (fetch):       caller's `timeout`, default 60s.
  //
  // The slot is consumed before the fetch and not refunded on failure.
  // Tinyfish's docs say failed URLs don't count against their quota, so
  // our limiter is slightly more conservative than the real cap. With
  // current load (~8/min vs 25/min cap) the over-conservatism is fine and
  // it removes a whole class of release/race bugs.
  await fetchLimiter.acquire(2 * 60_000)

  // Use undici.request, NOT the global fetch. fetch's response.body is a
  // web-streams ReadableStream; tearing one down (timeout / abort / GC) races
  // with React SSR's TransformStream wiring and corrupts the process-wide
  // web-streams pool, after which every SSR render crashes with
  // `controller[kState].transformAlgorithm is not a function`. undici.request
  // returns a Node Readable body and carries its own headers/body timeouts, so
  // crawl I/O never touches the web-streams path.
  let res: Dispatcher.ResponseData
  try {
    res = await request(baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Tinyfish uses X-API-Key (raw key, no Bearer prefix). Verified
        // against https://docs.tinyfish.ai/authentication and the OpenAPI
        // spec at https://docs.tinyfish.ai/openapi/fetch.json.
        "X-API-Key": apiKey,
      },
      body: JSON.stringify({ urls: [url], format: "markdown" }),
      headersTimeout: timeout,
      bodyTimeout: timeout,
    })
  } catch (err) {
    // undici surfaces low-level errors with the real code (UND_ERR_*,
    // ETIMEDOUT / ENOTFOUND / SSL) on the cause chain — formatFetchError
    // walks it so the cron logs tell us *why*.
    throw new CrawlError(url, formatFetchError(err))
  }

  const { statusCode, body } = res

  // Loud, distinct messages for the two operationally-meaningful failures.
  // The body must be consumed/dumped so undici can recycle the connection.
  if (statusCode === 401) {
    await body.dump().catch(() => {})
    throw new CrawlError(url, "Tinyfish 401: API key invalid or revoked")
  }
  if (statusCode === 429) {
    await body.dump().catch(() => {})
    throw new CrawlError(url, "Tinyfish 429: rate limit exceeded (25 URLs/min cap)")
  }
  if (statusCode < 200 || statusCode >= 300) {
    const text = await body.text().catch(() => "")
    throw new CrawlError(url, `Tinyfish HTTP ${statusCode}: ${text.slice(0, 500)}`)
  }

  let data: TinyfishResponse
  try {
    data = (await body.json()) as TinyfishResponse
  } catch (err) {
    throw new CrawlError(
      url,
      `Tinyfish returned 200 with invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  // We always send exactly one URL, so a non-empty errors[] means our URL failed.
  const perUrlError = data.errors?.[0]
  if (perUrlError) {
    throw new CrawlError(url, `Tinyfish per-URL error: ${perUrlError.error}`)
  }

  const result = data.results?.[0]
  if (!result || !result.text) {
    throw new CrawlError(url, "Tinyfish returned no text content")
  }

  return {
    url: result.final_url ?? result.url ?? url,
    markdown: result.text,
    title: result.title,
    crawledAt: new Date(),
  }
}

function formatFetchError(err: unknown): string {
  if (!(err instanceof Error)) return String(err)
  // Walk the cause chain, collecting `code` (Node sets ETIMEDOUT etc.) and
  // each error's message. Stop at depth 5 to avoid pathological loops.
  const parts: string[] = [`${err.name}: ${err.message}`]
  let cause: unknown = (err as Error & { cause?: unknown }).cause
  for (let depth = 0; depth < 5 && cause; depth++) {
    if (cause instanceof Error) {
      const code = (cause as NodeJS.ErrnoException).code
      parts.push(`cause: ${code ? `${code} ` : ""}${cause.name}: ${cause.message}`)
      cause = (cause as Error & { cause?: unknown }).cause
    } else {
      parts.push(`cause: ${String(cause)}`)
      break
    }
  }
  return parts.join(" | ")
}
