/**
 * Tinyfish adapter tests.
 *
 * Mocks undici's `request` (the crawler deliberately uses undici.request, not
 * the global fetch — see lib/tinyfish.ts) so we can assert on the request shape
 * (auth header, body) and exercise the response/error branches without a live
 * API key.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { CrawlError } from "./crawler-types"
// Imported after the mock is registered.
import { tinyfishCrawl } from "./tinyfish"

const { requestMock } = vi.hoisted(() => ({ requestMock: vi.fn() }))
vi.mock("undici", () => ({ request: requestMock }))

const ENDPOINT = "https://api.fetch.tinyfish.ai"

beforeEach(() => {
  process.env.TINYFISH_API_KEY = "test-key-123"
  requestMock.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

// A mock undici ResponseData whose body exposes the BodyMixin methods the
// crawler uses (json / text / dump). `payload` is returned as-is from text();
// json() parses it and throws on non-JSON (mirroring undici).
function mockResponse(statusCode: number, payload: unknown) {
  const text = typeof payload === "string" ? payload : JSON.stringify(payload)
  return {
    statusCode,
    headers: {},
    body: {
      json: async () => {
        try {
          return JSON.parse(text)
        } catch {
          throw new SyntaxError("Unexpected token in JSON")
        }
      },
      text: async () => text,
      dump: async () => {},
    },
  }
}

describe("tinyfishCrawl", () => {
  it("posts the URL with markdown format and X-API-Key auth", async () => {
    requestMock.mockImplementation(async () =>
      mockResponse(200, {
        results: [
          { url: "https://example.com", final_url: "https://example.com/", text: "# Example" },
        ],
      }),
    )

    const result = await tinyfishCrawl("https://example.com")

    expect(requestMock).toHaveBeenCalledTimes(1)
    const [calledUrl, opts] = requestMock.mock.calls[0] as [
      string,
      { headers: Record<string, string>; body: string },
    ]
    expect(calledUrl).toBe(ENDPOINT)
    expect(opts.headers["X-API-Key"]).toBe("test-key-123") // raw key, no Bearer prefix
    expect(JSON.parse(opts.body)).toEqual({ urls: ["https://example.com"], format: "markdown" })
    expect(result.markdown).toBe("# Example")
    expect(result.url).toBe("https://example.com/") // final_url wins
  })

  it("uses final_url over the original URL when present", async () => {
    requestMock.mockImplementation(async () =>
      mockResponse(200, {
        results: [
          {
            url: "https://example.com",
            final_url: "https://example.com/redirected",
            title: "Redirect target",
            text: "body",
          },
        ],
      }),
    )

    const result = await tinyfishCrawl("https://example.com")
    expect(result.url).toBe("https://example.com/redirected")
    expect(result.title).toBe("Redirect target")
  })

  it("throws a distinct error on 401", async () => {
    requestMock.mockImplementation(async () => mockResponse(401, "unauthorized"))
    await expect(tinyfishCrawl("https://example.com")).rejects.toThrow(/401.*invalid or revoked/)
  })

  it("throws a distinct error on 429 with the rate-limit hint", async () => {
    requestMock.mockImplementation(async () => mockResponse(429, "too many"))
    await expect(tinyfishCrawl("https://example.com")).rejects.toThrow(/429.*25 URLs\/min/)
  })

  it("propagates per-URL errors from the response body", async () => {
    requestMock.mockImplementation(async () =>
      mockResponse(200, {
        errors: [{ url: "https://blocked.example", error: "blocked by robots.txt" }],
      }),
    )
    await expect(tinyfishCrawl("https://blocked.example")).rejects.toThrow(
      /per-URL error: blocked by robots/,
    )
  })

  it("throws when the API responds with no text content", async () => {
    requestMock.mockImplementation(async () => mockResponse(200, { results: [{ url: "x" }] }))
    await expect(tinyfishCrawl("https://example.com")).rejects.toThrow(/no text content/)
  })

  it("rejects with CrawlError when TINYFISH_API_KEY is missing", async () => {
    delete process.env.TINYFISH_API_KEY
    await expect(tinyfishCrawl("https://example.com")).rejects.toBeInstanceOf(CrawlError)
  })

  it("wraps network errors in CrawlError", async () => {
    requestMock.mockImplementation(async () => {
      throw new TypeError("fetch failed")
    })
    await expect(tinyfishCrawl("https://example.com")).rejects.toThrow(/fetch failed/)
  })

  it("wraps malformed JSON (HTTP 200 with non-JSON body) in CrawlError", async () => {
    requestMock.mockImplementation(async () => mockResponse(200, "<html>cdn error page</html>"))
    await expect(tinyfishCrawl("https://example.com")).rejects.toBeInstanceOf(CrawlError)
    await expect(tinyfishCrawl("https://example.com")).rejects.toThrow(/invalid JSON/)
  })

  it("queues fetches via the shared limiter (observed via slotsInWindow)", async () => {
    // Sanity check that tinyfishCrawl actually goes through fetchLimiter.
    // We don't drive 25 concurrent calls (would be brittle in a unit suite),
    // we just verify a successful call increments the limiter's slot count.
    const { tinyfishFetchLimiter } = await import("./tinyfish")
    const before = tinyfishFetchLimiter.slotsInWindow()
    requestMock.mockImplementation(async () =>
      mockResponse(200, { results: [{ url: "x", text: "ok" }] }),
    )
    await tinyfishCrawl("https://example.com")
    expect(tinyfishFetchLimiter.slotsInWindow()).toBe(before + 1)
  })
})
