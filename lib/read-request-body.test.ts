import { describe, expect, it } from "vitest"

import {
  readRequestJsonBounded,
  readRequestTextBounded,
  RequestBodyTooLargeError,
} from "@/lib/read-request-body"

describe("readRequestTextBounded", () => {
  it("rejects a declared oversized body before reading", async () => {
    const request = new Request("https://example.com", {
      method: "POST",
      headers: { "content-length": "101" },
      body: "small",
    })
    await expect(readRequestTextBounded(request, 100)).rejects.toBeInstanceOf(
      RequestBodyTooLargeError,
    )
  })

  it("bounds chunked bodies without Content-Length", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("12345"))
        controller.enqueue(new TextEncoder().encode("67890"))
        controller.close()
      },
    })
    const request = new Request("https://example.com", {
      method: "POST",
      body,
      duplex: "half",
    } as RequestInit & { duplex: "half" })

    await expect(readRequestTextBounded(request, 9)).rejects.toBeInstanceOf(
      RequestBodyTooLargeError,
    )
  })

  it("returns valid bounded UTF-8 text", async () => {
    const request = new Request("https://example.com", { method: "POST", body: "你好" })
    await expect(readRequestTextBounded(request, 6)).resolves.toBe("你好")
  })

  it("parses bounded JSON without delegating to the unbounded request.json() reader", async () => {
    const request = new Request("https://example.com", {
      method: "POST",
      body: JSON.stringify({ value: 1 }),
    })
    await expect(readRequestJsonBounded(request, 32)).resolves.toEqual({ value: 1 })
  })
})
