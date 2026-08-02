import { createHash } from "node:crypto"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

export const GOOGLE_FONT_STYLESHEET_URLS = [
  "https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap",
  "https://fonts.googleapis.com/css2?family=Outfit:wght@100..900&display=swap",
  "https://fonts.googleapis.com/css2?family=IBM+Plex+Serif:wght@500;600;700&display=swap",
] as const

const GOOGLE_FONTS_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/104.0.0.0 Safari/537.36"
const MAX_STYLESHEET_BYTES = 64 * 1024
const MAX_FONT_FILES_PER_STYLESHEET = 32
const MAX_TOTAL_FONT_FILES = 64
const MAX_FONT_FILE_BYTES = 2 * 1024 * 1024
const MAX_TOTAL_FONT_BYTES = 20 * 1024 * 1024
const FETCH_ATTEMPTS = 6
const FETCH_TIMEOUT_MS = 20_000
const PREFETCH_DEADLINE_MS = 10 * 60_000

type FetchLike = (input: string, init: RequestInit) => Promise<Response>

export interface GoogleFontBuildCache {
  directory: string
  mockFilePath: string
  stylesheetCount: number
  fontFileCount: number
  totalFontBytes: number
  cleanup: () => Promise<void>
}

export async function prepareGoogleFontBuildCache(
  input: {
    fetchImpl?: FetchLike
    stylesheetUrls?: readonly string[]
    retryDelayMs?: number
  } = {},
): Promise<GoogleFontBuildCache> {
  const fetchImpl = input.fetchImpl ?? fetch
  const stylesheetUrls = input.stylesheetUrls ?? GOOGLE_FONT_STYLESHEET_URLS
  assertStylesheetAllowlist(stylesheetUrls)
  const directory = await mkdtemp(join(tmpdir(), "open-launch-next-fonts-"))
  const mockResponses: Record<string, string> = {}
  const downloadedFonts = new Map<string, { path: string; bytes: number }>()
  const deadlineAt = Date.now() + PREFETCH_DEADLINE_MS
  let totalFontBytes = 0

  try {
    for (const stylesheetUrl of stylesheetUrls) {
      const stylesheetResponse = await fetchWithRetry(stylesheetUrl, fetchImpl, {
        expectedHost: "fonts.googleapis.com",
        expectedContentTypes: ["text/css"],
        maxBytes: MAX_STYLESHEET_BYTES,
        deadlineAt,
        retryDelayMs: input.retryDelayMs,
      })
      const stylesheet = new TextDecoder().decode(stylesheetResponse)
      const fontUrls = extractGoogleFontUrls(stylesheet)
      if (fontUrls.length === 0 || fontUrls.length > MAX_FONT_FILES_PER_STYLESHEET) {
        throw new Error(
          `Google Fonts stylesheet returned an invalid font-file count: ${fontUrls.length}`,
        )
      }

      let localizedStylesheet = stylesheet
      for (const fontUrl of fontUrls) {
        let downloaded = downloadedFonts.get(fontUrl)
        if (!downloaded) {
          if (downloadedFonts.size >= MAX_TOTAL_FONT_FILES) {
            throw new Error("Google Fonts build cache exceeded its total file limit")
          }
          const fontBuffer = await fetchWithRetry(fontUrl, fetchImpl, {
            expectedHost: "fonts.gstatic.com",
            expectedContentTypes: [
              "font/woff2",
              "application/font-woff",
              "application/octet-stream",
            ],
            maxBytes: MAX_FONT_FILE_BYTES,
            deadlineAt,
            retryDelayMs: input.retryDelayMs,
          })
          totalFontBytes += fontBuffer.byteLength
          if (totalFontBytes > MAX_TOTAL_FONT_BYTES) {
            throw new Error("Google Fonts build cache exceeded its total byte limit")
          }
          const filename = `${createHash("sha256").update(fontUrl).digest("hex")}.woff2`
          const path = join(directory, filename)
          await writeFile(path, fontBuffer)
          downloaded = { path, bytes: fontBuffer.byteLength }
          downloadedFonts.set(fontUrl, downloaded)
        }
        localizedStylesheet = localizedStylesheet.replaceAll(fontUrl, downloaded.path)
      }
      if (localizedStylesheet.includes("https://fonts.gstatic.com")) {
        throw new Error("Google Fonts stylesheet contains an unlocalized font URL")
      }
      mockResponses[stylesheetUrl] = localizedStylesheet
    }

    const mockFilePath = join(directory, "mocked-responses.cjs")
    await writeFile(mockFilePath, `module.exports = ${JSON.stringify(mockResponses, null, 2)}\n`)
    return {
      directory,
      mockFilePath,
      stylesheetCount: stylesheetUrls.length,
      fontFileCount: downloadedFonts.size,
      totalFontBytes,
      cleanup: () => rm(directory, { recursive: true, force: true }),
    }
  } catch (error) {
    await rm(directory, { recursive: true, force: true })
    throw error
  }
}

export async function readGoogleFontMockResponses(
  mockFilePath: string,
): Promise<Record<string, string>> {
  const source = await readFile(mockFilePath, "utf8")
  const prefix = "module.exports = "
  if (!source.startsWith(prefix)) throw new Error("Google Fonts mock module has an invalid prefix")
  return JSON.parse(source.slice(prefix.length)) as Record<string, string>
}

function assertStylesheetAllowlist(stylesheetUrls: readonly string[]): void {
  if (
    stylesheetUrls.length !== GOOGLE_FONT_STYLESHEET_URLS.length ||
    stylesheetUrls.some((url, index) => url !== GOOGLE_FONT_STYLESHEET_URLS[index])
  ) {
    throw new Error("Google Fonts stylesheet allowlist does not match the reviewed layout fonts")
  }
}

function extractGoogleFontUrls(stylesheet: string): string[] {
  const urls = [...stylesheet.matchAll(/url\((https:\/\/[^)]+)\)/g)].map((match) => match[1])
  const uniqueUrls = [...new Set(urls)]
  for (const rawUrl of uniqueUrls) {
    const url = new URL(rawUrl)
    if (
      url.protocol !== "https:" ||
      url.hostname !== "fonts.gstatic.com" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !/^\/s\/[a-z0-9-]+\/v\d+\/[A-Za-z0-9_-]+\.woff2$/.test(url.pathname)
    ) {
      throw new Error("Google Fonts stylesheet contains a disallowed font URL")
    }
  }
  return uniqueUrls
}

async function fetchWithRetry(
  rawUrl: string,
  fetchImpl: FetchLike,
  input: {
    expectedHost: "fonts.googleapis.com" | "fonts.gstatic.com"
    expectedContentTypes: readonly string[]
    maxBytes: number
    deadlineAt: number
    retryDelayMs?: number
  },
): Promise<Uint8Array> {
  assertFetchUrl(rawUrl, input.expectedHost)
  let finalError: unknown
  for (let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt += 1) {
    const remainingMs = input.deadlineAt - Date.now()
    if (remainingMs <= 0) throw new Error("Google Fonts prefetch exceeded its deadline")
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), Math.min(FETCH_TIMEOUT_MS, remainingMs))
    try {
      const response = await fetchImpl(rawUrl, {
        headers: { "user-agent": GOOGLE_FONTS_USER_AGENT },
        redirect: "follow",
        signal: controller.signal,
      })
      if (!response.ok) throw new Error(`Google Fonts request returned HTTP ${response.status}`)
      assertFetchUrl(response.url || rawUrl, input.expectedHost)
      const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim()
      if (!contentType || !input.expectedContentTypes.includes(contentType)) {
        throw new Error("Google Fonts response has an unexpected content type")
      }
      const contentLength = Number(response.headers.get("content-length"))
      if (Number.isFinite(contentLength) && contentLength > input.maxBytes) {
        throw new Error("Google Fonts response exceeds its declared byte limit")
      }
      const buffer = new Uint8Array(await response.arrayBuffer())
      if (buffer.byteLength === 0 || buffer.byteLength > input.maxBytes) {
        throw new Error("Google Fonts response exceeds its byte limit")
      }
      return buffer
    } catch (error) {
      finalError = error
      if (attempt < FETCH_ATTEMPTS) {
        const retryDelayMs = (input.retryDelayMs ?? 250) * attempt
        if (Date.now() + retryDelayMs >= input.deadlineAt) {
          throw new Error("Google Fonts prefetch exceeded its deadline", { cause: finalError })
        }
        await delay(retryDelayMs)
      }
    } finally {
      clearTimeout(timeout)
    }
  }
  throw new Error(`Google Fonts prefetch failed after ${FETCH_ATTEMPTS} attempts`, {
    cause: finalError,
  })
}

function assertFetchUrl(
  rawUrl: string,
  expectedHost: "fonts.googleapis.com" | "fonts.gstatic.com",
): void {
  const url = new URL(rawUrl)
  if (
    url.protocol !== "https:" ||
    url.hostname !== expectedHost ||
    url.username ||
    url.password ||
    url.hash
  ) {
    throw new Error(`Google Fonts request URL is outside the ${expectedHost} allowlist`)
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}
