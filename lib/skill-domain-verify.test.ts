import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { extractAatVerifyMetaContent, verifySkillDomainProof } from "./skill-domain-verify"

const safeFetchMock = vi.hoisted(() => vi.fn())
const closeSafeFetchResponseMock = vi.hoisted(() => vi.fn())
const resolveTxtMock = vi.hoisted(() => vi.fn())

vi.mock("node:dns/promises", () => ({
  default: {
    resolveTxt: resolveTxtMock,
  },
}))

vi.mock("@/lib/safe-fetch", () => {
  class MockSafeFetchError extends Error {
    constructor(
      message: string,
      public readonly code: string,
    ) {
      super(message)
      this.name = "SafeFetchError"
    }
  }

  return {
    safeFetch: safeFetchMock,
    closeSafeFetchResponse: closeSafeFetchResponseMock,
    readSafeFetchText: async (
      response: Response,
      options: { maxBytes?: number; stopAfterHead?: boolean; label?: string } = {},
    ) => {
      const text = await response.text()
      const headClose = options.stopAfterHead ? text.match(/<\/head\s*>/i) : null
      const bounded =
        headClose?.index !== undefined ? text.slice(0, headClose.index + headClose[0].length) : text
      if (options.maxBytes && new TextEncoder().encode(bounded).byteLength > options.maxBytes) {
        const label = options.label ? options.label.replace(/\s+body$/i, "") : "Response"
        throw new Error(`${label} exceeded ${options.maxBytes} bytes`)
      }
      return bounded
    },
    SafeFetchError: MockSafeFetchError,
  }
})

function responseWithUrl(url: string, body: string, init?: ResponseInit): Response {
  const response = new Response(body, init)
  Object.defineProperty(response, "url", { value: url })
  return response
}

beforeEach(() => {
  safeFetchMock.mockReset()
  closeSafeFetchResponseMock.mockReset()
  resolveTxtMock.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("extractAatVerifyMetaContent", () => {
  it("extracts the aat-verify meta content regardless of attribute order", () => {
    expect(
      extractAatVerifyMetaContent(
        '<html><head><meta name="aat-verify" content="token-1"></head></html>',
      ),
    ).toBe("token-1")
    expect(
      extractAatVerifyMetaContent(
        "<html><head><meta content='token-2' data-x='1' name='aat-verify'></head></html>",
      ),
    ).toBe("token-2")
  })

  it("decodes common HTML attribute entities", () => {
    expect(
      extractAatVerifyMetaContent(
        '<html><head><meta name="aat-verify" content="a&amp;b&quot;c"></head></html>',
      ),
    ).toBe('a&b"c')
  })

  it("ignores unrelated meta tags", () => {
    expect(
      extractAatVerifyMetaContent(
        '<html><head><meta name="description" content="token"></head></html>',
      ),
    ).toBeNull()
  })

  it("ignores meta tags outside the document head", () => {
    expect(
      extractAatVerifyMetaContent(
        '<html><head></head><body><meta name="aat-verify" content="token"></body></html>',
      ),
    ).toBeNull()
  })
})

describe("verifySkillDomainProof", () => {
  it("rejects verification responses redirected to a different host", async () => {
    safeFetchMock.mockResolvedValueOnce(
      responseWithUrl("https://attacker.example/.well-known/aat-verify-token.txt", "token", {
        status: 200,
      }),
    )

    const result = await verifySkillDomainProof({
      domain: "victim.example",
      method: "html",
      token: "token",
    })

    expect(result).toEqual({
      verified: false,
      reason: "Verification URL redirected to a different host",
    })
    expect(safeFetchMock).toHaveBeenCalledTimes(1)
  })

  it("does not accept homepage text as a meta-tag proof", async () => {
    safeFetchMock.mockResolvedValueOnce(
      responseWithUrl("https://example.com/", "<html><body>token</body></html>", { status: 200 }),
    )

    const result = await verifySkillDomainProof({
      domain: "example.com",
      method: "meta",
      token: "token",
    })

    expect(result).toEqual({
      verified: false,
      reason: "Meta verification tag did not match token",
    })
  })

  it("accepts meta proofs on large homepages when the head is bounded", async () => {
    safeFetchMock.mockResolvedValueOnce(
      responseWithUrl(
        "https://example.com/",
        `<html><head><meta name="aat-verify" content="token"></head><body>${"x".repeat(
          512 * 1024,
        )}</body></html>`,
        { status: 200, headers: { "content-length": String(512 * 1024) } },
      ),
    )

    const result = await verifySkillDomainProof({
      domain: "example.com",
      method: "meta",
      token: "token",
    })

    expect(result).toEqual({ verified: true })
    expect(safeFetchMock).toHaveBeenCalledTimes(1)
  })

  it("bounds verification response bodies", async () => {
    const oversizedBody = "x".repeat(4097)
    safeFetchMock
      .mockResolvedValueOnce(
        responseWithUrl("https://example.com/.well-known/aat-verify-token.txt", oversizedBody, {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        responseWithUrl("http://example.com/.well-known/aat-verify-token.txt", oversizedBody, {
          status: 200,
        }),
      )

    const result = await verifySkillDomainProof({
      domain: "example.com",
      method: "html",
      token: "token",
    })

    expect(result.verified).toBe(false)
    expect(result.reason).toContain("Verification response exceeded 4096 bytes")
    expect(safeFetchMock).toHaveBeenCalledTimes(2)
  })

  it("bounds DNS TXT verification lookups", async () => {
    vi.useFakeTimers()
    resolveTxtMock.mockReturnValue(new Promise(() => {}))

    const resultPromise = verifySkillDomainProof({
      domain: "example.com",
      method: "dns",
      token: "token",
    })

    await vi.advanceTimersByTimeAsync(10_000)
    const result = await resultPromise

    expect(result.verified).toBe(false)
    expect(result.reason).toContain("DNS TXT verification timed out")
  })
})
