import { NextRequest, NextResponse } from "next/server"

import { db } from "@/drizzle/db"
import { project } from "@/drizzle/db/schema"
import { eq } from "drizzle-orm"

export const dynamic = "force-dynamic"

/**
 * Outbound link gate for low-quality projects.
 *
 * Project pages render external website URLs through `/go/<encoded-url>`
 * (with `rel="nofollow"`) when the project has been flagged by the AI
 * quality classifier. This handler:
 *   - Validates that the destination matches a known project's
 *     `websiteUrl` so we never become an open redirector.
 *   - Returns 302 + `X-Robots-Tag: noindex, nofollow` so search engines
 *     don't follow the redirect or pass juice through it.
 *
 * Quality projects keep their direct `<a href>` links and never go
 * through this handler.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ url: string[] }> }) {
  const { url: parts } = await context.params

  // The dynamic segment can be either a single percent-encoded URL like
  // `https%3A%2F%2Fexample.com` or split path segments. Re-join and decode.
  let target: string
  try {
    target = decodeURIComponent(parts.join("/"))
  } catch {
    return new NextResponse("Bad URL", { status: 400 })
  }

  // Plain http(s) only. No javascript:, data:, file:, mailto:, etc.
  if (!/^https?:\/\//i.test(target)) {
    return new NextResponse("Unsupported scheme", { status: 400 })
  }

  // Don't honour the redirect unless this URL is actually one of our
  // projects' registered websiteUrl. Prevents abuse as an open redirector.
  const [match] = await db
    .select({ id: project.id })
    .from(project)
    .where(eq(project.websiteUrl, target))
    .limit(1)

  if (!match) {
    return new NextResponse("Unknown destination", { status: 404 })
  }

  return new NextResponse(null, {
    status: 302,
    headers: {
      Location: target,
      "X-Robots-Tag": "noindex, nofollow",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  })
}
