import { headers } from "next/headers"
import { NextRequest, NextResponse } from "next/server"

import sharp from "sharp"

import { extractProjectInfo } from "@/lib/ai-content"
import { auth } from "@/lib/auth"
import { crawlUrl } from "@/lib/crawl4ai"
import { uploadFileToR2 } from "@/lib/r2-client"
import { checkRateLimit } from "@/lib/rate-limit"
import { getAllCategories } from "@/app/actions/projects"

export const maxDuration = 120

export async function POST(request: NextRequest) {
  try {
    // Auth check
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 })
    }

    // Rate limit: 5 requests per minute per user
    const { success: rateLimitOk } = await checkRateLimit(
      `auto-fill:${session.user.id}`,
      5,
      60 * 1000,
    )
    if (!rateLimitOk) {
      return NextResponse.json(
        { error: "Too many requests. Please wait a moment." },
        { status: 429 },
      )
    }

    const body = await request.json()
    const { websiteUrl } = body as { websiteUrl?: string }

    if (!websiteUrl) {
      return NextResponse.json({ error: "websiteUrl is required" }, { status: 400 })
    }

    // Validate URL
    let parsedUrl: URL
    try {
      parsedUrl = new URL(websiteUrl)
    } catch {
      return NextResponse.json({ error: "Invalid URL format" }, { status: 400 })
    }

    // Only allow HTTP/HTTPS to prevent SSRF (file://, ftp://, etc.)
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return NextResponse.json({ error: "Only HTTP/HTTPS URLs are supported" }, { status: 400 })
    }

    // Crawl the website
    let crawlResult
    try {
      crawlResult = await crawlUrl(websiteUrl, { timeout: 60000 })
    } catch (error) {
      console.error("Auto-fill crawl error:", error)
      return NextResponse.json(
        { error: "Could not access the website. Please check the URL and try again." },
        { status: 503 },
      )
    }

    // Get available categories for AI matching
    const categories = await getAllCategories()
    const categoryNames = categories.map((c) => c.name)

    // AI extraction
    let aiResult
    try {
      aiResult = await extractProjectInfo(crawlResult.markdown, crawlResult.title, categoryNames)
    } catch (error) {
      console.error("Auto-fill AI extraction error:", error)
      return NextResponse.json(
        { error: "AI extraction failed. Please try again." },
        { status: 503 },
      )
    }

    // Process logo: download and re-upload to R2
    let logoR2Url: string | null = null
    const logoSourceUrl = aiResult.logoUrl

    if (logoSourceUrl) {
      logoR2Url = await tryDownloadAndUploadLogo(logoSourceUrl, parsedUrl)
    }

    // Fallback: try common favicon paths
    if (!logoR2Url) {
      const fallbackPaths = ["/apple-touch-icon.png", "/favicon-32x32.png", "/favicon.ico"]
      for (const path of fallbackPaths) {
        const fallbackUrl = `${parsedUrl.origin}${path}`
        logoR2Url = await tryDownloadAndUploadLogo(fallbackUrl, parsedUrl)
        if (logoR2Url) break
      }
    }

    // Map AI category names to actual category IDs
    const matchedCategories = aiResult.categoryNames
      .map((name) => categories.find((c) => c.name.toLowerCase() === name.toLowerCase()))
      .filter((c): c is NonNullable<typeof c> => c !== null)
      .map((c) => c.id)

    return NextResponse.json({
      name: aiResult.name,
      description: aiResult.description,
      logoUrl: logoR2Url,
      tags: aiResult.tags,
      categories: matchedCategories,
      pricing: aiResult.pricing,
      platforms: aiResult.platforms,
    })
  } catch (error) {
    console.error("Auto-fill error:", error)
    return NextResponse.json(
      { error: "An unexpected error occurred. Please try again." },
      { status: 500 },
    )
  }
}

async function tryDownloadAndUploadLogo(imageUrl: string, baseUrl: URL): Promise<string | null> {
  try {
    // Resolve relative URLs
    let resolvedUrl: URL
    try {
      resolvedUrl = new URL(imageUrl, baseUrl.origin)
    } catch {
      return null
    }

    // Only allow HTTP/HTTPS to prevent SSRF
    if (!["http:", "https:"].includes(resolvedUrl.protocol)) return null

    const response = await fetch(resolvedUrl.toString(), {
      signal: AbortSignal.timeout(10000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; OpenLaunch/1.0)" },
    })

    if (!response.ok) return null

    const contentType = response.headers.get("content-type") || ""
    if (!contentType.startsWith("image/")) return null

    const contentLength = parseInt(response.headers.get("content-length") || "0", 10)
    if (contentLength > 5 * 1024 * 1024) return null // 5MB limit

    const arrayBuffer = await response.arrayBuffer()
    const inputBuffer = Buffer.from(arrayBuffer)

    if (inputBuffer.length === 0 || inputBuffer.length > 5 * 1024 * 1024) return null

    // Convert to AVIF via sharp (same pattern as app/api/upload/route.ts)
    let finalBuffer: Buffer
    let finalContentType: string

    if (contentType.includes("svg")) {
      // SVG: convert to PNG first, then AVIF
      finalBuffer = await sharp(inputBuffer)
        .resize(256, 256, { fit: "contain" })
        .avif({ quality: 90 })
        .toBuffer()
      finalContentType = "image/avif"
    } else if (contentType.includes("ico")) {
      // ICO: try to process, may fail on multi-frame
      try {
        finalBuffer = await sharp(inputBuffer)
          .resize(256, 256, { fit: "contain" })
          .avif({ quality: 90 })
          .toBuffer()
        finalContentType = "image/avif"
      } catch {
        return null
      }
    } else if (contentType.includes("gif")) {
      finalBuffer = inputBuffer
      finalContentType = contentType
    } else {
      finalBuffer = await sharp(inputBuffer).avif({ quality: 90, effort: 6 }).toBuffer()
      finalContentType = "image/avif"
    }

    const ext = finalContentType.includes("gif") ? "gif" : "avif"
    const fileName = `autofill-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
    const fileUrl = await uploadFileToR2(finalBuffer, fileName, finalContentType, "logos")

    return fileUrl
  } catch {
    return null
  }
}
