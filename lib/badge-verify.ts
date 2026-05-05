import { isPrivateHostname } from "@/lib/utils"

/**
 * Server-side check that the given website hosts a link back to aat.ee.
 * Used by both /api/projects/verify-badge (interactive UI) and submitProject
 * (storage-time enforcement so client cannot fake hasBadgeVerified=true).
 *
 * Returns true only on definitive confirmation. Network errors, redirects to
 * private hosts, non-2xx responses, etc. all yield false (deny by default).
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
          return false
        }
        currentUrl = nextUrl
        continue
      }

      finalResponse = r
      break
    }

    if (!finalResponse || !finalResponse.ok) return false

    const html = await finalResponse.text()
    return /www\.aat\.ee/i.test(html) || /aat\.ee\/\?ref=badge/i.test(html)
  } catch {
    return false
  } finally {
    clearTimeout(timeoutId)
  }
}
