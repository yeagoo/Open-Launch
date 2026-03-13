import { headers } from "next/headers"
import { NextRequest, NextResponse } from "next/server"

import { auth } from "@/lib/auth"
import { checkRateLimit } from "@/lib/rate-limit"
import { isPrivateHostname } from "@/lib/utils"

/**
 * Verify if a website contains the aat.ee badge link.
 * Returns { verified: true/false } — does NOT modify any project record.
 * The caller (submit form) stores the verification result in local state
 * and passes hasBadgeVerified when creating the project.
 */
export async function POST(request: NextRequest) {
  try {
    // Auth check — only logged-in users can verify badges
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 })
    }

    // Rate limiting per user
    const rateLimitResult = await checkRateLimit(
      `badge-verify:${session.user.id}`,
      10, // 10 requests
      60 * 1000, // per minute
    )

    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 },
      )
    }

    const body = await request.json()
    const { websiteUrl } = body

    if (!websiteUrl) {
      return NextResponse.json({ error: "Website URL is required" }, { status: 400 })
    }

    // Validate URL format and protocol (prevent SSRF)
    let url: URL
    try {
      url = new URL(websiteUrl)
    } catch {
      return NextResponse.json({ error: "Invalid URL format" }, { status: 400 })
    }

    if (!["http:", "https:"].includes(url.protocol)) {
      return NextResponse.json({ error: "Only HTTP/HTTPS URLs are supported" }, { status: 400 })
    }

    if (isPrivateHostname(url.hostname)) {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400 })
    }

    // Fetch the website content, following redirects with SSRF checks at each hop
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
            clearTimeout(timeoutId)
            return NextResponse.json({ error: "Invalid URL" }, { status: 400 })
          }
          currentUrl = nextUrl
          continue
        }

        finalResponse = r
        break
      }

      clearTimeout(timeoutId)

      if (!finalResponse || !finalResponse.ok) {
        return NextResponse.json(
          { error: `Failed to fetch website: ${finalResponse?.status ?? "unknown"}` },
          { status: 400 },
        )
      }

      const html = await finalResponse.text()

      // Check for aat.ee domain link
      const hasDomain = /www\.aat\.ee/i.test(html) || /aat\.ee\/\?ref=badge/i.test(html)

      if (!hasDomain) {
        return NextResponse.json(
          {
            verified: false,
            message:
              "aat.ee link not found on your website. Please add a link to www.aat.ee on your website and try again.",
          },
          { status: 200 },
        )
      }

      return NextResponse.json({
        verified: true,
        message: "Badge verified successfully! You can now schedule your launch for tomorrow.",
      })
    } catch (error: unknown) {
      clearTimeout(timeoutId)

      if (error instanceof Error && error.name === "AbortError") {
        return NextResponse.json(
          { error: "Request timeout. Website took too long to respond." },
          { status: 408 },
        )
      }

      console.error("Error fetching website:", error)
      return NextResponse.json({ error: "Failed to fetch website content" }, { status: 500 })
    }
  } catch (error) {
    console.error("Error verifying badge:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
