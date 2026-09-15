import { NextRequest } from "next/server"

import { proxy } from "@/proxy"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => {
  const intl = vi.fn((_request: Request) => {
    void _request
    return new Response(null, { status: 204 })
  })
  const intlPrefetch = vi.fn((_request: Request) => {
    void _request
    return new Response(null, { status: 204 })
  })
  const createMiddleware = vi.fn((config?: { localeCookie?: boolean }) =>
    config?.localeCookie === false ? intlPrefetch : intl,
  )
  return { createMiddleware, intl, intlPrefetch }
})
const { intl, intlPrefetch } = mocks
vi.mock("next-intl/middleware", () => ({ default: mocks.createMiddleware }))
vi.mock("better-auth/cookies", () => ({ getSessionCookie: () => null }))

beforeEach(() => {
  intl.mockClear()
  intlPrefetch.mockClear()
})
afterEach(() => vi.unstubAllEnvs())
describe("non-localized community routing", () => {
  it("bypasses locale rewriting for community preview even with a Chinese session", async () => {
    const response = await proxy(
      new NextRequest("https://www.aat.ee/design-preview/community", {
        headers: { "accept-language": "zh-CN", cookie: "NEXT_LOCALE=zh" },
      }),
    )
    expect(intl).not.toHaveBeenCalled()
    expect(response.headers.get("x-middleware-next")).toBe("1")
    expect(response.headers.get("x-middleware-request-x-aat-request-id")).toBeNull()
  })
  it("does not bypass locale rewriting for lookalike paths", async () => {
    await proxy(new NextRequest("https://www.aat.ee/design-preview-other"))
    expect(intl).toHaveBeenCalledOnce()
  })
  it("keeps the real English-only community route outside locale rewriting", async () => {
    vi.stubEnv("COMMUNITY_ENABLED", "1")
    const response = await proxy(
      new NextRequest("https://www.aat.ee/community?type=shipped", {
        headers: {
          "accept-language": "zh-CN",
          cookie: "NEXT_LOCALE=zh",
        },
      }),
    )
    expect(intl).not.toHaveBeenCalled()
    expect(response.headers.get("x-middleware-next")).toBe("1")
    expect(response.headers.get("x-middleware-request-x-aat-community-route")).toBe("1")
    const requestId = response.headers.get("x-aat-request-id")
    expect(requestId).toBeTruthy()
    expect(response.headers.get("x-middleware-request-x-aat-request-id")).toBe(requestId)
    expect(response.headers.get("x-middleware-override-headers")).toContain("x-aat-community-route")
    expect(response.headers.get("x-middleware-override-headers")).toContain("x-aat-request-id")
  })
  it("returns a real 404 before streaming when the forum flag is closed", async () => {
    vi.stubEnv("COMMUNITY_ENABLED", "0")
    const response = await proxy(new NextRequest("https://www.aat.ee/community?type=shipped"))
    expect(intl).not.toHaveBeenCalled()
    expect(response.status).toBe(404)
  })
  it("rejects unusable canonical thread paths before they can stream a 200 response", async () => {
    vi.stubEnv("COMMUNITY_ENABLED", "1")
    for (const path of ["t", "t/not-a-uuid", "t/not-a-uuid/edit", "t/post%2Fa"]) {
      const response = await proxy(new NextRequest(`https://www.aat.ee/community/${path}`))
      expect(response.status, path).toBe(404)
      expect(response.headers.get("x-middleware-request-x-aat-community-route"), path).toBe("1")
      expect(response.headers.get("x-middleware-request-x-aat-request-id"), path).toBe(
        response.headers.get("x-aat-request-id"),
      )
    }
    expect(intl).not.toHaveBeenCalled()
  })
  it("rejects unsupported canonical thread descendants before they can stream a 200 response", async () => {
    vi.stubEnv("COMMUNITY_ENABLED", "1")
    const validId = "550e8400-e29b-41d4-a716-446655440000"
    for (const path of [
      `t/${validId}/history`,
      `t/${validId}/edit/history`,
      "t/not-a-uuid/replies",
    ]) {
      const response = await proxy(new NextRequest(`https://www.aat.ee/community/${path}`))
      expect(response.status, path).toBe(404)
      expect(response.headers.get("x-middleware-request-x-aat-community-route"), path).toBe("1")
      expect(response.headers.get("x-middleware-request-x-aat-request-id"), path).toBe(
        response.headers.get("x-aat-request-id"),
      )
    }
    expect(intl).not.toHaveBeenCalled()
  })
  it("keeps syntactically valid canonical thread paths available to the page loader", async () => {
    vi.stubEnv("COMMUNITY_ENABLED", "1")
    const validId = "ffffffff-ffff-ffff-ffff-ffffffffffff"
    for (const path of [`t/${validId}`, `t/${validId}/edit`]) {
      const response = await proxy(new NextRequest(`https://www.aat.ee/community/${path}`))
      expect(response.headers.get("x-middleware-next"), path).toBe("1")
    }
    expect(intl).not.toHaveBeenCalled()
  })
  it("sends legacy personal-feed addresses to their permanent canonical redirects", async () => {
    vi.stubEnv("COMMUNITY_ENABLED", "0")
    for (const [path, destination] of [
      ["mine", "mine"],
      ["saved", "saved"],
    ]) {
      const response = await proxy(new NextRequest(`https://www.aat.ee/community/${path}`))
      expect(response.status).toBe(308)
      expect(response.headers.get("location")).toBe(
        `https://www.aat.ee/community?view=${destination}`,
      )
    }
    expect(intl).not.toHaveBeenCalled()
  })
  it("sends legacy post detail routes to permanent canonical redirects before streaming", async () => {
    vi.stubEnv("COMMUNITY_ENABLED", "0")
    for (const [path, destination] of [
      ["post%2Fa", "t/post%2Fa"],
      ["post%2Fa/edit", "t/post%2Fa/edit"],
      // `/community/new/edit` resolves to the old dynamic editor route, even
      // though `/community/new` itself is a static route.
      ["new/edit", "t/new/edit"],
    ]) {
      const response = await proxy(new NextRequest(`https://www.aat.ee/community/${path}`))
      expect(response.status).toBe(308)
      expect(response.headers.get("location")).toBe(`https://www.aat.ee/community/${destination}`)
    }
    expect(intl).not.toHaveBeenCalled()
  })
  it("does not mistake navigable static community routes for legacy post ids", async () => {
    vi.stubEnv("COMMUNITY_ENABLED", "1")
    for (const path of ["new", "moderation"]) {
      const response = await proxy(new NextRequest(`https://www.aat.ee/community/${path}`))
      expect(response.headers.get("x-middleware-next")).toBe("1")
    }
    expect(intl).not.toHaveBeenCalled()
  })
  it("bridges a locale-prefixed community switch to the canonical route and persists the choice", async () => {
    vi.stubEnv("COMMUNITY_ENABLED", "0")
    const response = await proxy(
      new NextRequest("https://www.aat.ee/zh/community?type=shipped&sort=hot"),
    )
    expect(intl).not.toHaveBeenCalled()
    expect(response.status).toBe(307)
    expect(response.headers.get("location")).toBe(
      "https://www.aat.ee/community?type=shipped&sort=hot",
    )
    expect(response.headers.get("set-cookie")).toContain("NEXT_LOCALE=zh")
  })
  it("does not let a stale router request persist a locale through the community bridge", async () => {
    vi.stubEnv("COMMUNITY_ENABLED", "1")
    const response = await proxy(
      new NextRequest("https://www.aat.ee/zh/community", {
        headers: { "next-url": "/community" },
      }),
    )

    expect(response.status).toBe(307)
    expect(response.headers.get("location")).toBe("https://www.aat.ee/community")
    expect(response.headers.get("set-cookie")).toBeNull()
  })
  it("does not let a stale localized router prefetch overwrite the selected locale", async () => {
    const response = await proxy(
      new NextRequest("https://www.aat.ee/es/projects", {
        headers: { "next-router-prefetch": "1" },
      }),
    )

    expect(response.headers.get("set-cookie")).toBeNull()
    expect(response.headers.get("x-middleware-set-cookie")).toBeNull()
    expect(intl).not.toHaveBeenCalled()
    expect(intlPrefetch).toHaveBeenCalledOnce()
  })
  it("keeps locale cookies out of RSC navigation responses", async () => {
    await proxy(
      new NextRequest("https://www.aat.ee/es/projects?_rsc=fixture", {
        headers: { "next-url": "/community", rsc: "1" },
      }),
    )

    expect(intl).not.toHaveBeenCalled()
    expect(intlPrefetch).toHaveBeenCalledOnce()
  })
  it("does not trust a client-supplied community document marker on a localized page", async () => {
    intl.mockImplementationOnce(
      (request: Request) => new Response(request.headers.get("x-aat-community-route") ?? "missing"),
    )

    const response = await proxy(
      new NextRequest("https://www.aat.ee/zh/projects", {
        headers: { "x-aat-community-route": "1" },
      }),
    )

    await expect(response.text()).resolves.toBe("missing")
  })
})
