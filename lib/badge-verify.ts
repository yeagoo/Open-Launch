import sanitizeHtml from "sanitize-html"

import {
  closeSafeFetchResponse,
  readSafeFetchText,
  safeFetch,
  SafeFetchError,
  type SafeFetchResponse,
} from "@/lib/safe-fetch"
import { tinyfishCrawl } from "@/lib/tinyfish"
import { isPrivateHostname } from "@/lib/utils"

const BADGE_PAGE_MAX_BYTES = 1024 * 1024
const BADGE_FETCH_TIMEOUT_MS = 10_000

function decodeHtmlUrl(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&#38;/g, "&")
    .replace(/&#x26;/gi, "&")
    .trim()
}

function isAatLink(value: string): boolean {
  try {
    const url = new URL(decodeHtmlUrl(value))
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      (url.hostname === "aat.ee" || url.hostname === "www.aat.ee")
    )
  } catch {
    return false
  }
}

/** Accept an actual HTML/Markdown link to aat.ee, never a bare text mention. */
export function containsAatBadgeLink(content: string): boolean {
  // Parse away comments, scripts, styles and every non-anchor element before
  // inspecting hrefs. A raw regex alone would accept strings such as
  // `<!-- <a href="https://aat.ee"> -->` or an anchor literal in JavaScript.
  const anchorsOnly = sanitizeHtml(content, {
    allowedTags: ["a"],
    allowedAttributes: { a: ["href"] },
    allowedSchemes: ["http", "https"],
    allowProtocolRelative: false,
  })
  const htmlLinks = anchorsOnly.matchAll(
    /<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>`]+))/gi,
  )
  for (const match of htmlLinks) {
    if (isAatLink(match[1] ?? match[2] ?? match[3] ?? "")) return true
  }

  const markdownLinks = content.matchAll(/\[[^\]]*\]\((https?:\/\/[^\s)]+)(?:\s+[^)]*)?\)/gi)
  for (const match of markdownLinks) {
    if (isAatLink(match[1])) return true
  }

  const autolinks = content.matchAll(/<(https?:\/\/[^\s>]+)>/gi)
  for (const match of autolinks) {
    if (isAatLink(match[1])) return true
  }
  return false
}

/**
 * Server-side check that the given website hosts a link back to aat.ee.
 * Used by both /api/projects/verify-badge (interactive UI) and submitProject
 * (storage-time enforcement so client cannot fake hasBadgeVerified=true).
 *
 * Returns true only on definitive confirmation. Network errors, redirects to
 * private hosts, non-2xx responses, etc. all yield false (deny by default).
 *
 * Two-tier fetch: raw HTTP first (cheap, doesn't burn Tinyfish quota), and
 * if the response is a CF/edge-style block (403/429/503) or a network
 * failure we retry through Tinyfish — which renders in a real browser and
 * threads the challenge. Without this, a user installing the badge on a
 * Cloudflare-protected site loses Fast-Track silently.
 */
export async function verifyAatBadgeServerSide(websiteUrl: string): Promise<boolean> {
  let url: URL
  try {
    url = new URL(websiteUrl)
  } catch {
    return false
  }

  if (!["http:", "https:"].includes(url.protocol)) return false
  if (isPrivateHostname(url.hostname)) return false

  // Path 1: raw fetch. Most sites have no CF challenge so this is the
  // common case and finishes in <1s without spending a Tinyfish slot.
  const rawResult = await tryRawFetch(url)
  if (rawResult.kind === "ok") return containsAatBadgeLink(rawResult.html)
  if (rawResult.kind === "deny") return false

  // Path 2: Tinyfish fallback. Only reached when rawFetch returned a
  // challenge-shaped failure (403/429/503/network).
  try {
    const result = await tinyfishCrawl(websiteUrl, { timeout: 30_000 })
    // Search rendered markdown for a real link so anchor text like
    // `[Featured on aat.ee](https://www.aat.ee/?ref=badge)` matches.
    return containsAatBadgeLink(result.markdown)
  } catch {
    return false
  }
}

type RawFetchOutcome =
  | { kind: "ok"; html: string }
  // Definitively no badge — don't bother spending a Tinyfish call.
  // Covers things like 404, hard 4xx, redirect to a private host.
  | { kind: "deny" }
  // Looks like a bot challenge or transient outage — Tinyfish may succeed.
  | { kind: "challenge" }

async function tryRawFetch(url: URL): Promise<RawFetchOutcome> {
  let response: SafeFetchResponse
  try {
    response = await safeFetch(url, {
      headers: { "User-Agent": "aat.ee Badge Verifier/1.0" },
      timeoutMs: BADGE_FETCH_TIMEOUT_MS,
    })
  } catch (err) {
    // SSRF-shaped rejections (private host, bad protocol, too many
    // redirects) are definitive denials — Tinyfish can't help.
    if (err instanceof SafeFetchError) {
      if (
        err.code === "private_host" ||
        err.code === "private_resolved_ip" ||
        err.code === "protocol" ||
        err.code === "invalid_redirect" ||
        err.code === "too_many_redirects"
      ) {
        return { kind: "deny" }
      }
    }
    // Network/timeout/DNS-resolution failures look like a CF challenge
    // shape — let Tinyfish try with its own browser+DNS path.
    return { kind: "challenge" }
  }

  // 403 / 429 / 503 are the classic CF managed-challenge / rate-limit /
  // edge-block signatures. Any of those → defer to Tinyfish.
  if ([403, 429, 503].includes(response.status)) {
    closeSafeFetchResponse(response)
    return { kind: "challenge" }
  }
  if (!response.ok) {
    closeSafeFetchResponse(response)
    return { kind: "deny" }
  }

  try {
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? ""
    if (
      contentType &&
      !contentType.includes("text/html") &&
      !contentType.includes("application/xhtml+xml") &&
      !contentType.includes("text/plain")
    ) {
      return { kind: "deny" }
    }
    const html = await readSafeFetchText(response, {
      deadline: Date.now() + BADGE_FETCH_TIMEOUT_MS,
      maxBytes: BADGE_PAGE_MAX_BYTES,
      label: "Badge verification response",
    })
    return { kind: "ok", html }
  } finally {
    closeSafeFetchResponse(response)
  }
}
