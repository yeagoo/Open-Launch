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

  // Wait for an in-process rate-limit slot before issuing the request.
  // The limiter wait counts against the same per-call timeout — a caller
  // willing to wait `timeout` ms total shouldn't have its budget consumed
  // entirely by queue time, but at our load this is a safe simplification.
  await fetchLimiter.acquire(timeout)

  let response: Response
  try {
    response = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ urls: [url], format: "markdown" }),
      signal: AbortSignal.timeout(timeout),
    })
  } catch (err) {
    throw new CrawlError(url, err instanceof Error ? err.message : String(err))
  }

  // Loud, distinct messages for the two operationally-meaningful failures.
  if (response.status === 401) {
    throw new CrawlError(url, "Tinyfish 401: API key invalid or revoked")
  }
  if (response.status === 429) {
    throw new CrawlError(url, "Tinyfish 429: rate limit exceeded (25 URLs/min cap)")
  }
  if (!response.ok) {
    const body = await response.text().catch(() => "")
    throw new CrawlError(url, `Tinyfish HTTP ${response.status}: ${body.slice(0, 500)}`)
  }

  const data = (await response.json()) as TinyfishResponse

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
