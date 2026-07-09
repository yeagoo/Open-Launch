import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { registerServerFetchGuard, resetServerFetchGuardForTest } from "./server-fetch-guard"

const fetchWithTimeoutMock = vi.hoisted(() => vi.fn())

vi.mock("@/lib/fetch-timeout", () => ({
  fetchWithTimeout: fetchWithTimeoutMock,
  withTimeout: <T>(promise: Promise<T>) => promise,
}))

describe("server fetch guard", () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    fetchWithTimeoutMock.mockReset()
    globalThis.fetch = vi.fn(async () => new Response("original")) as typeof fetch
    vi.spyOn(console, "warn").mockImplementation(() => {})
  })

  afterEach(() => {
    resetServerFetchGuardForTest()
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it("routes absolute HTTP(S) fetches through the undici-backed timeout helper", async () => {
    fetchWithTimeoutMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: new Headers({ "content-type": "application/json" }),
      arrayBuffer: async () => new TextEncoder().encode('{"ok":true}').buffer,
    })

    registerServerFetchGuard()

    const response = await fetch("https://api.example.com/path?token=secret", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: '{"hello":"world"}',
      signal: AbortSignal.timeout(1000),
    })

    expect(await response.json()).toEqual({ ok: true })
    expect(fetchWithTimeoutMock).toHaveBeenCalledWith(
      new URL("https://api.example.com/path?token=secret"),
      expect.objectContaining({
        method: "POST",
        body: '{"hello":"world"}',
      }),
      30_000,
      "server global fetch https://api.example.com",
    )
    expect(console.warn).toHaveBeenCalledWith(
      "[server-global-fetch]",
      expect.stringContaining("token=%5Bredacted%5D"),
    )
  })

  it("falls back to the original fetch for relative URLs", async () => {
    const originalFetchMock = globalThis.fetch as ReturnType<typeof vi.fn>
    registerServerFetchGuard()

    const response = await fetch("/api/search?q=test")

    expect(await response.text()).toBe("original")
    expect(originalFetchMock).toHaveBeenCalledWith("/api/search?q=test", undefined)
    expect(fetchWithTimeoutMock).not.toHaveBeenCalled()
  })
})
