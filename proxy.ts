import { NextRequest, NextResponse } from "next/server"

import { routing } from "@/i18n/routing"
import { getSessionCookie } from "better-auth/cookies"
import createMiddleware from "next-intl/middleware"

const intlMiddleware = createMiddleware(routing)

const BOT_UA_REGEX = /bot|crawler|spider|crawling|slurp|facebookexternalhit/i
// Next.js 16.2 action identifiers in this build are 40-character hex hashes.
// Reject obvious probes such as `Next-Action: x` before they reach the action
// resolver and generate noisy "Failed to find Server Action" exceptions.
const SERVER_ACTION_ID_REGEX = /^[a-f0-9]{40}$/i

const REQUEST_ID_HEADER = "x-aat-request-id"

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
  return response
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const requestId = requestIdFor(request)

  const serverActionId = request.headers.get("next-action")
  if (serverActionId && !SERVER_ACTION_ID_REGEX.test(serverActionId)) {
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
  ],
}
