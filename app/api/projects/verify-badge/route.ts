import { NextRequest, NextResponse } from "next/server"

import { db } from "@/drizzle/db"
import { project } from "@/drizzle/db/schema"
import { eq } from "drizzle-orm"

import { checkRateLimit } from "@/lib/rate-limit"

/**
 * Verify if a website contains the aat.ee badge
 * This endpoint checks if the provided URL contains the badge code
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { websiteUrl, projectId } = body

    // Rate limiting - use IP address for rate limiting
    const ip =
      request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown"
    const rateLimitResult = await checkRateLimit(
      `badge-verify:${ip}`,
      10, // 10 requests
      60 * 1000, // per minute
    )

    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 },
      )
    }

    if (!websiteUrl) {
      return NextResponse.json({ error: "Website URL is required" }, { status: 400 })
    }

    // Validate URL format
    let url: URL
    try {
      url = new URL(websiteUrl)
    } catch {
      return NextResponse.json({ error: "Invalid URL format" }, { status: 400 })
    }

    // Fetch the website content with timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout

    try {
      const response = await fetch(url.toString(), {
        signal: controller.signal,
        headers: {
          "User-Agent": "aat.ee Badge Verifier/1.0",
        },
        // Follow redirects
        redirect: "follow",
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        return NextResponse.json(
          { error: `Failed to fetch website: ${response.status}` },
          { status: 400 },
        )
      }

      const html = await response.text()

      // Check for aat.ee domain link only (no badge image check)
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

      // If projectId is provided, update the project record
      if (projectId) {
        await db
          .update(project)
          .set({
            hasBadgeVerified: true,
            badgeVerifiedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(project.id, projectId))
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
          {
            status: 408,
          },
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
