import { Readable } from "node:stream"

import { beforeEach, describe, expect, it, vi } from "vitest"

import { closeSafeFetchResponse, readSafeFetchBuffer, safeFetch } from "./safe-fetch"

const lookupMock = vi.hoisted(() => vi.fn())
const requestMock = vi.hoisted(() => vi.fn())
const decompressInterceptor = vi.hoisted(() => vi.fn())
const decompressMock = vi.hoisted(() => vi.fn(() => decompressInterceptor))
const clientInstances = vi.hoisted(() => [] as Array<Record<string, any>>)
const clientMock = vi.hoisted(() =>
  vi.fn(function MockClient(this: Record<string, any>, origin: string, options: object) {
    this.origin = origin
    this.options = options
    this.dispatcher = { client: this, options }
    this.compose = vi.fn(() => this.dispatcher)
    this.close = vi.fn(async () => undefined)
    this.destroy = vi.fn()
    clientInstances.push(this)
  }),
)

vi.mock("node:dns/promises", () => ({
  default: {
    lookup: lookupMock,
  },
}))

vi.mock("undici", () => ({
  Client: clientMock,
  interceptors: {
    decompress: decompressMock,
  },
  request: requestMock,
}))

beforeEach(() => {
  lookupMock.mockReset()
  requestMock.mockReset()
  decompressMock.mockClear()
  decompressInterceptor.mockClear()
  clientMock.mockClear()
  clientInstances.length = 0
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
    expect(requestMock).not.toHaveBeenCalled()
  })

  it("rejects public-looking hosts that resolve to private addresses", async () => {
    lookupMock.mockResolvedValueOnce([{ address: "169.254.169.254", family: 4 }])

    await expect(safeFetch("https://public.example/page")).rejects.toMatchObject({
      code: "private_resolved_ip",
    })
    expect(requestMock).not.toHaveBeenCalled()
  })

  it("pins connect-time DNS lookup to prevalidated records", async () => {
    lookupMock.mockResolvedValueOnce([
      { address: "93.184.216.34", family: 4 },
      { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
    ])
    requestMock.mockImplementationOnce(async (_url, options) => {
      const lookup = options.dispatcher.client.options.connect.lookup
      await expect(callPinnedLookup(lookup, { family: 4 })).resolves.toEqual({
        address: "93.184.216.34",
        family: 4,
      })
      await expect(callPinnedLookup(lookup, { all: true })).resolves.toEqual([
        { address: "93.184.216.34", family: 4 },
        { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
      ])

      return undiciResponse("ok")
    })

    const response = await safeFetch("https://public.example/page")

    expect(await response.text()).toBe("ok")
    expect(requestMock).toHaveBeenCalledWith(
      new URL("https://public.example/page"),
      expect.objectContaining({
        dispatcher: clientInstances[0].dispatcher,
        method: "GET",
        headers: expect.objectContaining({
          "accept-encoding": "br, gzip, deflate",
        }),
      }),
    )
    expect(clientInstances[0].origin).toBe("https://public.example")
    expect(clientInstances[0].options).toMatchObject({
      autoSelectFamily: true,
      autoSelectFamilyAttemptTimeout: 250,
    })
    expect(decompressMock).toHaveBeenCalledWith({ skipErrorResponses: false })
    expect(clientInstances[0].compose).toHaveBeenCalledWith(decompressInterceptor)
  })

  it("preserves caller accept-encoding while still enabling decompression", async () => {
    lookupMock.mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }])
    requestMock.mockResolvedValueOnce(undiciResponse("ok"))

    const response = await safeFetch("https://public.example/page", {
      headers: {
        "Accept-Encoding": "gzip",
      },
    })
    closeSafeFetchResponse(response)

    expect(requestMock).toHaveBeenCalledWith(
      new URL("https://public.example/page"),
      expect.objectContaining({
        dispatcher: clientInstances[0].dispatcher,
        headers: expect.objectContaining({
          "accept-encoding": "gzip",
        }),
      }),
    )
    expect(decompressMock).toHaveBeenCalledWith({ skipErrorResponses: false })
  })

  it("revalidates redirect targets", async () => {
    lookupMock.mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }])
    const redirected = undiciResponse("", {
      statusCode: 302,
      statusText: "Found",
      headers: { location: "http://127.0.0.1/internal" },
    })
    requestMock.mockResolvedValueOnce(redirected)

    await expect(safeFetch("https://public.example/start")).rejects.toMatchObject({
      code: "private_host",
    })
    expect(requestMock).toHaveBeenCalledTimes(1)
    expect(redirected.body.listenerCount("error")).toBeGreaterThan(0)
    expect(redirected.body.destroyed).toBe(true)
  })

  it("allows public http responses", async () => {
    lookupMock.mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }])
    requestMock.mockResolvedValueOnce(
      undiciResponse("ok", {
        headers: { "content-type": "text/plain" },
      }),
    )

    const response = await safeFetch("https://public.example/page")

    expect(response.status).toBe(200)
    expect(response.ok).toBe(true)
    expect(response.url).toBe("https://public.example/page")
    expect(response.headers.get("content-type")).toBe("text/plain")
    expect(await response.text()).toBe("ok")
  })

  it("bounds buffered body reads and closes oversized responses", async () => {
    lookupMock.mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }])
    requestMock.mockResolvedValueOnce({
      ...undiciResponse(""),
      body: Readable.from([Buffer.alloc(4), Buffer.alloc(4)]),
    })

    const response = await safeFetch("https://public.example/image.png")

    await expect(
      readSafeFetchBuffer(response, {
        maxBytes: 5,
        label: "Image download",
      }),
    ).rejects.toThrow("Image download exceeded 5 bytes")
    expect(clientInstances[0].destroy).toHaveBeenCalledTimes(1)
  })

  it("lets callers explicitly close unconsumed responses", async () => {
    lookupMock.mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }])
    const upstream = undiciResponse("ok")
    requestMock.mockResolvedValueOnce(upstream)

    const response = await safeFetch("https://public.example/page")
    closeSafeFetchResponse(response)

    expect(upstream.body.listenerCount("error")).toBeGreaterThan(0)
    expect(upstream.body.destroyed).toBe(true)
    expect(clientInstances[0].close).toHaveBeenCalledTimes(1)
  })

  it("maps undici phase timeouts to SafeFetchError timeout", async () => {
    lookupMock.mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }])
    requestMock.mockRejectedValueOnce(
      Object.assign(new Error("headers timeout"), { code: "UND_ERR_HEADERS_TIMEOUT" }),
    )

    await expect(safeFetch("https://public.example/page")).rejects.toMatchObject({
      code: "timeout",
    })
  })
})

function undiciResponse(
  body: string,
  options: {
    statusCode?: number
    statusText?: string
    headers?: Record<string, string | string[]>
  } = {},
) {
  return {
    statusCode: options.statusCode ?? 200,
    statusText: options.statusText ?? "OK",
    headers: options.headers ?? {},
    body: Readable.from([Buffer.from(body)]),
  }
}

function callPinnedLookup(
  lookup: (hostname: string, options: any, callback: (...args: any[]) => void) => void,
  options: Record<string, unknown>,
) {
  return new Promise((resolve, reject) => {
    lookup("public.example", options, (error, address, family) => {
      if (error) reject(error)
      else if (Array.isArray(address)) resolve(address)
      else resolve({ address, family })
    })
  })
}
