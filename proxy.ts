import { NextRequest, NextResponse } from "next/server"

import { routing } from "@/i18n/routing"
import { getSessionCookie } from "better-auth/cookies"
import createMiddleware from "next-intl/middleware"

import { isPlausibleServerActionId } from "@/lib/server-action-id"
import { stagingReadOnlyDecision } from "@/lib/staging-read-only"

const intlMiddleware = createMiddleware(routing)

const BOT_UA_REGEX = /bot|crawler|spider|crawling|slurp|facebookexternalhit/i

const REQUEST_ID_HEADER = "x-aat-request-id"
const STAGING_READ_ONLY = process.env.STAGING_READ_ONLY === "true"

const SESSION_GUARDED_PATHS = ["/dashboard", "/settings", "/admin"]

// Routes that intentionally live outside the [locale] segment (English-only or admin)
const NON_LOCALIZED_PREFIXES = ["/admin", "/compare", "/alternatives"]

// Build a regex that matches a leading supported-locale segment, e.g. "/zh", "/et"
const LEADING_LOCALE_REGEX = new RegExp(`^/(${routing.locales.join("|")})(?=/|$)`)

function stripLocale(pathname: string): string {
  return pathname.replace(LEADING_LOCALE_REGEX, "") || "/"
}

function isSessionGuarded(pathname: string): boolean {
  const stripped = stripLocale(pathname)
  return SESSION_GUARDED_PATHS.some((p) => stripped === p || stripped.startsWith(p + "/"))
}

function isNonLocalized(pathname: string): boolean {
  return NON_LOCALIZED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))
}

function requestIdFor(request: NextRequest): string {
  return (
    request.headers.get(REQUEST_ID_HEADER) ||
    request.headers.get("x-zeabur-request-id") ||
    request.headers.get("cf-ray") ||
    crypto.randomUUID()
  )
}

function withRequestId<T extends Response>(response: T, requestId: string): T {
  response.headers.set(REQUEST_ID_HEADER, requestId)
  if (STAGING_READ_ONLY) {
    response.headers.set("x-robots-tag", "noindex, nofollow, noarchive")
  }
  return response
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const requestId = requestIdFor(request)

  const stagingDecision = stagingReadOnlyDecision(STAGING_READ_ONLY, request.method, pathname)
  if (stagingDecision) {
    return withRequestId(new NextResponse(null, { status: stagingDecision.status }), requestId)
  }

  // The API matcher exists only so staging read-only mode can gate API writes.
  // In normal operation API routes must continue directly to their handlers,
  // without locale rewriting.
  if (pathname === "/api" || pathname.startsWith("/api/")) {
    return withRequestId(NextResponse.next(), requestId)
  }

  const serverActionId = request.headers.get("next-action")
  if (serverActionId && !isPlausibleServerActionId(serverActionId)) {
    return withRequestId(new NextResponse(null, { status: 404 }), requestId)
  }

  // Session guards run first (cookie-only check; role/ban verified in layouts)
  if (isSessionGuarded(pathname)) {
    const sessionCookie = getSessionCookie(request)
    if (!sessionCookie) {
      return withRequestId(NextResponse.redirect(new URL("/", request.url)), requestId)
    }
  }

  // Non-localized routes (admin / compare / alternatives) skip intl rewriting entirely
  if (isNonLocalized(pathname)) {
    return withRequestId(NextResponse.next(), requestId)
  }

  // Bots: strip Accept-Language so next-intl uses the default locale (no surprise redirects)
  const userAgent = request.headers.get("user-agent") ?? ""
  if (BOT_UA_REGEX.test(userAgent)) {
    const headers = new Headers(request.headers)
    headers.delete("accept-language")
    headers.delete("cookie")
    headers.set(REQUEST_ID_HEADER, requestId)
    const sanitized = new NextRequest(request.url, {
      headers,
      method: request.method,
    })
    return withRequestId(intlMiddleware(sanitized), requestId)
  }

  return withRequestId(intlMiddleware(request), requestId)
}

export const config = {
  matcher: [
    "/((?!api|_next|_vercel|.*\\..*|sitemap.xml|robots.txt|feed.xml|llms.txt|favicon.ico).*)",
    "/api/:path*",
  ],
}
