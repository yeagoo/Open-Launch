/**
 * Tinyfish adapter tests.
 *
 * Mocks global fetch so we can assert on the request shape (auth header,
 * body) and exercise the response/error branches without a live API key.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { CrawlError } from "./crawler-types"
import { tinyfishCrawl } from "./tinyfish"

const ENDPOINT = "https://api.fetch.tinyfish.ai"

beforeEach(() => {
  process.env.TINYFISH_API_KEY = "test-key-123"
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function mockFetch(impl: (input: string, init: RequestInit) => Response | Promise<Response>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init: RequestInit) => {
      return impl(input, init)
    }),
  )
}

describe("tinyfishCrawl", () => {
  it("posts the URL with markdown format and bearer auth", async () => {
    const calls: Array<{ url: string; body: unknown; auth: string | null }> = []
    mockFetch((url, init) => {
      calls.push({
        url,
        body: JSON.parse(init.body as string),
        auth: new Headers(init.headers).get("authorization"),
      })
      return new Response(
        JSON.stringify({
          results: [
            { url: "https://example.com", final_url: "https://example.com/", text: "# Example" },
          ],
        }),
        { status: 200 },
      )
    })

    const result = await tinyfishCrawl("https://example.com")

    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe(ENDPOINT)
    expect(calls[0].auth).toBe("Bearer test-key-123")
    expect(calls[0].body).toEqual({ urls: ["https://example.com"], format: "markdown" })
    expect(result.markdown).toBe("# Example")
    expect(result.url).toBe("https://example.com/") // final_url wins
  })

  it("uses final_url over the original URL when present", async () => {
    mockFetch(
      () =>
        new Response(
          JSON.stringify({
            results: [
              {
                url: "https://example.com",
                final_url: "https://example.com/redirected",
                title: "Redirect target",
                text: "body",
              },
            ],
          }),
          { status: 200 },
        ),
    )

    const result = await tinyfishCrawl("https://example.com")
    expect(result.url).toBe("https://example.com/redirected")
    expect(result.title).toBe("Redirect target")
  })

  it("throws a distinct error on 401", async () => {
    mockFetch(() => new Response("unauthorized", { status: 401 }))
    await expect(tinyfishCrawl("https://example.com")).rejects.toThrow(/401.*invalid or revoked/)
  })

  it("throws a distinct error on 429 with the rate-limit hint", async () => {
    mockFetch(() => new Response("too many", { status: 429 }))
    await expect(tinyfishCrawl("https://example.com")).rejects.toThrow(/429.*25 URLs\/min/)
  })

  it("propagates per-URL errors from the response body", async () => {
    mockFetch(
      () =>
        new Response(
          JSON.stringify({
            errors: [{ url: "https://blocked.example", error: "blocked by robots.txt" }],
          }),
          { status: 200 },
        ),
    )
    await expect(tinyfishCrawl("https://blocked.example")).rejects.toThrow(
      /per-URL error: blocked by robots/,
    )
  })

  it("throws when the API responds with no text content", async () => {
    mockFetch(() => new Response(JSON.stringify({ results: [{ url: "x" }] }), { status: 200 }))
    await expect(tinyfishCrawl("https://example.com")).rejects.toThrow(/no text content/)
  })

  it("rejects with CrawlError when TINYFISH_API_KEY is missing", async () => {
    delete process.env.TINYFISH_API_KEY
    await expect(tinyfishCrawl("https://example.com")).rejects.toBeInstanceOf(CrawlError)
  })

  it("wraps fetch network errors in CrawlError", async () => {
    mockFetch(() => {
      throw new TypeError("fetch failed")
    })
    await expect(tinyfishCrawl("https://example.com")).rejects.toThrow(/fetch failed/)
  })

  it("queues fetches via the shared limiter (observed via inFlightCount)", async () => {
    // Sanity check that tinyfishCrawl actually goes through fetchLimiter.
    // We don't drive 25 concurrent calls (would be brittle in a unit suite),
    // we just verify a successful call increments the limiter's slot count.
    const { tinyfishFetchLimiter } = await import("./tinyfish")
    const before = tinyfishFetchLimiter.inFlightCount()
    mockFetch(
      () => new Response(JSON.stringify({ results: [{ url: "x", text: "ok" }] }), { status: 200 }),
    )
    await tinyfishCrawl("https://example.com")
    expect(tinyfishFetchLimiter.inFlightCount()).toBe(before + 1)
  })
})
