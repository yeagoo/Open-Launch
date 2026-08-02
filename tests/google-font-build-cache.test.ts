import { access } from "node:fs/promises"

import { describe, expect, it, vi } from "vitest"

import {
  GOOGLE_FONT_STYLESHEET_URLS,
  prepareGoogleFontBuildCache,
  readGoogleFontMockResponses,
} from "../scripts/lib/google-font-build-cache"

const fontUrls = [
  "https://fonts.gstatic.com/s/inter/v20/inter-latin.woff2",
  "https://fonts.gstatic.com/s/outfit/v15/outfit-latin.woff2",
  "https://fonts.gstatic.com/s/ibmplexserif/v20/plex-latin.woff2",
] as const

describe("Google Fonts build cache", () => {
  it("localizes the reviewed stylesheets into bounded temporary font files", async () => {
    const fetchImpl = vi.fn(async (rawUrl: string) => {
      const stylesheetIndex = GOOGLE_FONT_STYLESHEET_URLS.indexOf(
        rawUrl as (typeof GOOGLE_FONT_STYLESHEET_URLS)[number],
      )
      if (stylesheetIndex >= 0) {
        return response(
          `@font-face { src: url(${fontUrls[stylesheetIndex]}) format('woff2'); }`,
          "text/css; charset=utf-8",
          rawUrl,
        )
      }
      const fontIndex = fontUrls.indexOf(rawUrl as (typeof fontUrls)[number])
      if (fontIndex >= 0) {
        return response(new Uint8Array([fontIndex + 1, 2, 3]), "font/woff2", rawUrl)
      }
      throw new Error("unexpected test URL")
    })

    const cache = await prepareGoogleFontBuildCache({ fetchImpl, retryDelayMs: 0 })
    try {
      expect(cache).toMatchObject({ stylesheetCount: 3, fontFileCount: 3, totalFontBytes: 9 })
      const mocks = await readGoogleFontMockResponses(cache.mockFilePath)
      expect(Object.keys(mocks)).toEqual([...GOOGLE_FONT_STYLESHEET_URLS])
      for (const css of Object.values(mocks)) {
        expect(css).not.toContain("https://fonts.gstatic.com")
        const localPath = /url\((\/[^)]+\.woff2)\)/.exec(css)?.[1]
        expect(localPath).toBeTruthy()
        await expect(access(localPath!)).resolves.toBeUndefined()
      }
    } finally {
      await cache.cleanup()
    }
    await expect(access(cache.directory)).rejects.toThrow()
  })

  it("retries transient responses without expanding the URL allowlist", async () => {
    let firstStylesheetAttempts = 0
    const fetchImpl = vi.fn(async (rawUrl: string) => {
      const stylesheetIndex = GOOGLE_FONT_STYLESHEET_URLS.indexOf(
        rawUrl as (typeof GOOGLE_FONT_STYLESHEET_URLS)[number],
      )
      if (stylesheetIndex === 0 && firstStylesheetAttempts++ === 0) {
        return response("unavailable", "text/plain", rawUrl, 503)
      }
      if (stylesheetIndex >= 0) {
        return response(
          `@font-face { src: url(${fontUrls[stylesheetIndex]}) format('woff2'); }`,
          "text/css",
          rawUrl,
        )
      }
      return response(new Uint8Array([1]), "font/woff2", rawUrl)
    })
    const cache = await prepareGoogleFontBuildCache({ fetchImpl, retryDelayMs: 0 })
    await cache.cleanup()
    expect(firstStylesheetAttempts).toBe(2)
  })

  it("rejects redirects or CSS font URLs outside the reviewed Google hosts", async () => {
    const fetchImpl = vi.fn(async (rawUrl: string) =>
      response("@font-face { src: url(https://attacker.example/font.woff2); }", "text/css", rawUrl),
    )
    await expect(prepareGoogleFontBuildCache({ fetchImpl, retryDelayMs: 0 })).rejects.toThrow(
      "disallowed font URL",
    )
  })

  it("rejects an unreviewed stylesheet list before making a request", async () => {
    const fetchImpl = vi.fn()
    await expect(
      prepareGoogleFontBuildCache({
        fetchImpl,
        stylesheetUrls: ["https://fonts.googleapis.com/css2?family=Roboto"],
      }),
    ).rejects.toThrow("allowlist")
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it("rejects an excessive number of distinct font files across stylesheets", async () => {
    const fetchImpl = vi.fn(async (rawUrl: string) => {
      const stylesheetIndex = GOOGLE_FONT_STYLESHEET_URLS.indexOf(
        rawUrl as (typeof GOOGLE_FONT_STYLESHEET_URLS)[number],
      )
      if (stylesheetIndex >= 0) {
        const css = Array.from({ length: 32 }, (_, fontIndex) => {
          const id = `${stylesheetIndex}_${fontIndex}`
          return `@font-face { src: url(https://fonts.gstatic.com/s/inter/v20/font_${id}.woff2); }`
        }).join("\n")
        return response(css, "text/css", rawUrl)
      }
      return response(new Uint8Array([1]), "font/woff2", rawUrl)
    })

    await expect(prepareGoogleFontBuildCache({ fetchImpl, retryDelayMs: 0 })).rejects.toThrow(
      "total file limit",
    )
  })
})

function response(body: BodyInit, contentType: string, url: string, status = 200): Response {
  const result = new Response(body, { status, headers: { "content-type": contentType } })
  Object.defineProperty(result, "url", { value: url })
  return result
}
