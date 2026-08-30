import { createHash } from "node:crypto"

import { NextRequest, NextResponse } from "next/server"

import { parseCspViolationReport } from "@/lib/content-security-policy"
import { logger } from "@/lib/observability/structured-logger"
import { checkRateLimit } from "@/lib/rate-limit"

export const dynamic = "force-dynamic"

const MAX_REPORT_BYTES = 16 * 1024

export async function POST(request: NextRequest) {
  const contentLength = Number(request.headers.get("content-length") ?? 0)
  if (Number.isFinite(contentLength) && contentLength > MAX_REPORT_BYTES) {
    return new NextResponse(null, { status: 413 })
  }

  const sourceKey = hashReportSource(clientAddress(request))
  const { success } = await checkRateLimit(`csp-report:${sourceKey}`, 60, 60_000, {
    onRedisError: "fail-closed",
  })
  if (!success) return new NextResponse(null, { status: 429 })

  let text: string
  try {
    text = await request.text()
  } catch {
    return new NextResponse(null, { status: 400 })
  }
  if (!text || Buffer.byteLength(text, "utf8") > MAX_REPORT_BYTES) {
    return new NextResponse(null, { status: text ? 413 : 400 })
  }

  let payload: unknown
  try {
    payload = JSON.parse(text)
  } catch {
    return new NextResponse(null, { status: 400 })
  }

  const report = parseCspViolationReport(payload)
  if (!report) return new NextResponse(null, { status: 400 })

  logger.warn("csp_violation_reported", {
    route: report.documentPath,
    status: report.statusCode,
    provider: "browser",
    context: {
      blockedHost: report.blockedHost,
      effectiveDirective: report.effectiveDirective,
      violatedDirective: report.violatedDirective,
      disposition: report.disposition,
    },
  })

  return new NextResponse(null, { status: 204 })
}

function clientAddress(request: NextRequest): string {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim() ||
    "unknown"
  )
}

function hashReportSource(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 24)
}
