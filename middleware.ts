import { NextRequest, NextResponse } from "next/server"

import { routing } from "@/i18n/routing"
import { getSessionCookie } from "better-auth/cookies"
import createMiddleware from "next-intl/middleware"

const intlMiddleware = createMiddleware(routing)

const BOT_UA_REGEX = /bot|crawler|spider|crawling|slurp|facebookexternalhit/i

const SESSION_GUARDED_PATHS = ["/dashboard", "/settings", "/admin"]

function isSessionGuarded(pathname: string): boolean {
  // Strip leading locale segment if present (e.g. "/zh/dashboard" -> "/dashboard")
  const stripped = pathname.replace(/^\/[a-z]{2}(?=\/|$)/, "") || "/"
  return SESSION_GUARDED_PATHS.some((p) => stripped === p || stripped.startsWith(p + "/"))
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
  // Match all paths except API, static assets, image optimizer, and SEO files
  matcher: [
    "/((?!api|_next|_vercel|.*\\..*|sitemap.xml|robots.txt|feed.xml|llms.txt|favicon.ico).*)",
  ],
}
