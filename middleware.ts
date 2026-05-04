import { NextRequest, NextResponse } from "next/server"

import { routing } from "@/i18n/routing"
import { getSessionCookie } from "better-auth/cookies"
import createMiddleware from "next-intl/middleware"

const intlMiddleware = createMiddleware(routing)

const BOT_UA_REGEX = /bot|crawler|spider|crawling|slurp|facebookexternalhit/i

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

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Session guards run first (cookie-only check; role/ban verified in layouts)
  if (isSessionGuarded(pathname)) {
    const sessionCookie = getSessionCookie(request)
    if (!sessionCookie) {
      return NextResponse.redirect(new URL("/", request.url))
    }
  }

  // Non-localized routes (admin / compare / alternatives) skip intl rewriting entirely
  if (isNonLocalized(pathname)) {
    return NextResponse.next()
  }

  // Bots: strip Accept-Language so next-intl uses the default locale (no surprise redirects)
  const userAgent = request.headers.get("user-agent") ?? ""
  if (BOT_UA_REGEX.test(userAgent)) {
    const headers = new Headers(request.headers)
    headers.delete("accept-language")
    headers.delete("cookie")
    const sanitized = new NextRequest(request.url, {
      headers,
      method: request.method,
    })
    return intlMiddleware(sanitized)
  }

  return intlMiddleware(request)
}

export const config = {
  matcher: [
    "/((?!api|_next|_vercel|.*\\..*|sitemap.xml|robots.txt|feed.xml|llms.txt|favicon.ico).*)",
  ],
}
