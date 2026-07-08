import {
  closeSafeFetchResponse,
  safeFetch,
  SafeFetchError,
  type SafeFetchResponse,
} from "@/lib/safe-fetch"
import { tinyfishCrawl } from "@/lib/tinyfish"
import { isPrivateHostname } from "@/lib/utils"

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

  // Reuse the same content check on both branches: rendered text or raw
  // HTML, either way the URL string should be present somewhere.
  const containsBadgeLink = (text: string): boolean =>
    /www\.aat\.ee/i.test(text) || /aat\.ee\/\?ref=badge/i.test(text)

  // Path 1: raw fetch. Most sites have no CF challenge so this is the
  // common case and finishes in <1s without spending a Tinyfish slot.
  const rawResult = await tryRawFetch(url)
  if (rawResult.kind === "ok") return containsBadgeLink(rawResult.html)
  if (rawResult.kind === "deny") return false

  // Path 2: Tinyfish fallback. Only reached when rawFetch returned a
  // challenge-shaped failure (403/429/503/network).
  try {
    const result = await tinyfishCrawl(websiteUrl, { timeout: 30_000 })
    // Tinyfish reports `final_url` after JS+redirects; search both that
    // and the rendered markdown so anchor text like
    // `[Featured on aat.ee](https://www.aat.ee/?ref=badge)` matches.
    const haystack = `${result.url}\n${result.markdown}`
    return containsBadgeLink(haystack)
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
      timeoutMs: 10000,
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
    const html = await response.text()
    return { kind: "ok", html }
  } finally {
    closeSafeFetchResponse(response)
  }
}
