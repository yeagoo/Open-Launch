/**
 * Tinyfish adapter tests.
 *
 * Runs a local HTTP server for the crawler (which deliberately uses
 * undici.request, not the global fetch — see lib/tinyfish.ts) so we can assert
 * on the request shape and exercise response/error branches without a live API
 * key or external network.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import type { AddressInfo } from "node:net"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { CrawlError } from "./crawler-types"
import { tinyfishCrawl, tinyfishFetchLimiter } from "./tinyfish"

type TestHandler = (req: IncomingMessage, res: ServerResponse, body: string) => void | Promise<void>

let server: Server
let handler: TestHandler | null = null

async function closeTestServer() {
  if (!server.listening) return
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()))
  })
}

beforeEach(async () => {
  process.env.TINYFISH_API_KEY = "test-key-123"
  server = createServer(async (req, res) => {
    let body = ""
    req.setEncoding("utf8")
    for await (const chunk of req) body += chunk
    if (!handler) {
      res.statusCode = 500
      res.end("test handler not configured")
      return
    }
    await handler(req, res, body)
  })
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject)
      resolve()
    })
  })
  const { port } = server.address() as AddressInfo
  process.env.TINYFISH_BASE_URL = `http://127.0.0.1:${port}`
})

afterEach(async () => {
  handler = null
  delete process.env.TINYFISH_BASE_URL
  await closeTestServer()
})

function mockResponse(statusCode: number, payload: object | string) {
  handler = (_req, res) => {
    res.statusCode = statusCode
    if (typeof payload === "string") {
      res.end(payload)
    } else {
      res.setHeader("content-type", "application/json")
      res.end(JSON.stringify(payload))
    }
  }
}

describe("tinyfishCrawl", () => {
  it("posts the URL with markdown format and X-API-Key auth", async () => {
    handler = (req, res, body) => {
      expect(req.url).toBe("/")
      expect(req.method).toBe("POST")
      expect(req.headers["x-api-key"]).toBe("test-key-123") // raw key, no Bearer prefix
      expect(JSON.parse(body)).toEqual({
        urls: ["https://example.com"],
        format: "markdown",
      })
      res.setHeader("content-type", "application/json")
      res.end(
        JSON.stringify({
          results: [
            { url: "https://example.com", final_url: "https://example.com/", text: "# Example" },
          ],
        }),
      )
    }

    const result = await tinyfishCrawl("https://example.com")

    expect(result.markdown).toBe("# Example")
    expect(result.url).toBe("https://example.com/") // final_url wins
  })

  it("uses final_url over the original URL when present", async () => {
    mockResponse(200, {
      results: [
        {
          url: "https://example.com",
          final_url: "https://example.com/redirected",
          title: "Redirect target",
          text: "body",
        },
      ],
    })

    const result = await tinyfishCrawl("https://example.com")
    expect(result.url).toBe("https://example.com/redirected")
    expect(result.title).toBe("Redirect target")
  })

  it("throws a distinct error on 401", async () => {
    mockResponse(401, "unauthorized")
    await expect(tinyfishCrawl("https://example.com")).rejects.toThrow(/401.*invalid or revoked/)
  })

  it("throws a distinct error on 429 with the rate-limit hint", async () => {
    mockResponse(429, "too many")
    await expect(tinyfishCrawl("https://example.com")).rejects.toThrow(/429.*25 URLs\/min/)
  })

  it("propagates per-URL errors from the response body", async () => {
    mockResponse(200, {
      errors: [{ url: "https://blocked.example", error: "blocked by robots.txt" }],
    })
    await expect(tinyfishCrawl("https://blocked.example")).rejects.toThrow(
      /per-URL error: blocked by robots/,
    )
  })

  it("throws when the API responds with no text content", async () => {
    mockResponse(200, { results: [{ url: "x" }] })
    await expect(tinyfishCrawl("https://example.com")).rejects.toThrow(/no text content/)
  })

  it("rejects with CrawlError when TINYFISH_API_KEY is missing", async () => {
    delete process.env.TINYFISH_API_KEY
    await expect(tinyfishCrawl("https://example.com")).rejects.toBeInstanceOf(CrawlError)
  })

  it("wraps network errors in CrawlError", async () => {
    await closeTestServer()
    await expect(tinyfishCrawl("https://example.com")).rejects.toThrow(
      /ECONNREFUSED|connect|closed|fetch failed/i,
    )
  })

  it("wraps malformed JSON (HTTP 200 with non-JSON body) in CrawlError", async () => {
    mockResponse(200, "<html>cdn error page</html>")
    await expect(tinyfishCrawl("https://example.com")).rejects.toBeInstanceOf(CrawlError)
    await expect(tinyfishCrawl("https://example.com")).rejects.toThrow(/invalid JSON/)
  })

  it("queues fetches via the shared limiter (observed via slotsInWindow)", async () => {
    // Sanity check that tinyfishCrawl actually goes through fetchLimiter.
    // We don't drive 25 concurrent calls (would be brittle in a unit suite),
    // we just verify a successful call increments the limiter's slot count.
    const before = tinyfishFetchLimiter.slotsInWindow()
    mockResponse(200, { results: [{ url: "x", text: "ok" }] })
    await tinyfishCrawl("https://example.com")
    expect(tinyfishFetchLimiter.slotsInWindow()).toBe(before + 1)
  })
})
