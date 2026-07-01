import { beforeEach, describe, expect, it, vi } from "vitest"

import { safeFetch } from "./safe-fetch"

const lookupMock = vi.hoisted(() => vi.fn())
const fetchWithTimeoutMock = vi.hoisted(() => vi.fn())

vi.mock("node:dns/promises", () => ({
  default: {
    lookup: lookupMock,
  },
}))

vi.mock("@/lib/fetch-timeout", () => {
  class MockFetchTimeoutError extends Error {}
  return {
    FetchTimeoutError: MockFetchTimeoutError,
    fetchWithTimeout: fetchWithTimeoutMock,
  }
})

beforeEach(() => {
  lookupMock.mockReset()
  fetchWithTimeoutMock.mockReset()
})

describe("safeFetch SSRF guard", () => {
  it("rejects literal private hosts before DNS or HTTP", async () => {
    await expect(safeFetch("http://127.0.0.1/admin")).rejects.toMatchObject({
      code: "private_host",
    })
    await expect(safeFetch("http://169.254.169.254/latest/meta-data")).rejects.toMatchObject({
      code: "private_host",
    })
    await expect(safeFetch("http://localhost:3000")).rejects.toMatchObject({
      code: "private_host",
    })
    await expect(safeFetch("http://2130706433/")).rejects.toMatchObject({
      code: "private_host",
    })

    expect(lookupMock).not.toHaveBeenCalled()
    expect(fetchWithTimeoutMock).not.toHaveBeenCalled()
  })

  it("rejects public-looking hosts that resolve to private addresses", async () => {
    lookupMock.mockResolvedValueOnce([{ address: "169.254.169.254", family: 4 }])

    await expect(safeFetch("https://public.example/page")).rejects.toMatchObject({
      code: "private_resolved_ip",
    })
    expect(fetchWithTimeoutMock).not.toHaveBeenCalled()
  })

  it("revalidates redirect targets", async () => {
    lookupMock.mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }])
    fetchWithTimeoutMock.mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { location: "http://127.0.0.1/internal" },
      }),
    )

    await expect(safeFetch("https://public.example/start")).rejects.toMatchObject({
      code: "private_host",
    })
    expect(fetchWithTimeoutMock).toHaveBeenCalledTimes(1)
  })

  it("allows public http responses", async () => {
    const response = new Response("ok", { status: 200 })
    lookupMock.mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }])
    fetchWithTimeoutMock.mockResolvedValueOnce(response)

    await expect(safeFetch("https://public.example/page")).resolves.toBe(response)
  })
})
