import { headers } from "next/headers"
import { NextRequest, NextResponse } from "next/server"

import { auth } from "@/lib/auth"
import { verifyAatBadgeServerSide } from "@/lib/badge-verify"
import { checkRateLimit } from "@/lib/rate-limit"

/**
 * Verify if a website contains the aat.ee badge link.
 * Returns { verified: true/false } — does NOT modify any project record.
 * The submitProject server action also re-verifies on its own before storing
 * hasBadgeVerified=true, so the client value is never trusted.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 })
    }

    const rateLimitResult = await checkRateLimit(`badge-verify:${session.user.id}`, 10, 60 * 1000)
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 },
      )
    }

    const body = await request.json()
    const { websiteUrl } = body

    if (!websiteUrl || typeof websiteUrl !== "string") {
      return NextResponse.json({ error: "Website URL is required" }, { status: 400 })
    }

    const verified = await verifyAatBadgeServerSide(websiteUrl)

    if (!verified) {
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
      message: "Badge verified successfully! You can now schedule your launch in 2 days.",
    })
  } catch (error) {
    console.error("Error verifying badge:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
