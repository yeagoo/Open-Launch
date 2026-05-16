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
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 10000)
  try {
    let currentUrl = url
    let finalResponse: Response | null = null

    for (let hop = 0; hop <= 5; hop++) {
      const r = await fetch(currentUrl.toString(), {
        signal: controller.signal,
        headers: { "User-Agent": "aat.ee Badge Verifier/1.0" },
        redirect: "manual",
      })

      if (r.status >= 300 && r.status < 400) {
        const location = r.headers.get("location")
        if (!location) break
        let nextUrl: URL
        try {
          nextUrl = new URL(location, currentUrl.toString())
        } catch {
          break
        }
        if (
          !["http:", "https:"].includes(nextUrl.protocol) ||
          isPrivateHostname(nextUrl.hostname)
        ) {
          return { kind: "deny" }
        }
        currentUrl = nextUrl
        continue
      }

      finalResponse = r
      break
    }

    // Exhausted the 5-hop redirect budget with no terminal 2xx/4xx/5xx —
    // typically a misconfigured site or a redirect loop, not a CF
    // challenge. Don't burn a Tinyfish slot on it.
    if (!finalResponse) return { kind: "deny" }

    // 403 / 429 / 503 are the classic CF managed-challenge / rate-limit /
    // edge-block signatures. Any of those → defer to Tinyfish.
    if ([403, 429, 503].includes(finalResponse.status)) return { kind: "challenge" }
    if (!finalResponse.ok) return { kind: "deny" }

    const html = await finalResponse.text()
    return { kind: "ok", html }
  } catch {
    return { kind: "challenge" }
  } finally {
    clearTimeout(timeoutId)
  }
}
