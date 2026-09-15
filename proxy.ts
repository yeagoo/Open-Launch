import { NextRequest, NextResponse } from "next/server"

import { routing } from "@/i18n/routing"
import { getSessionCookie } from "better-auth/cookies"
import createMiddleware from "next-intl/middleware"

import { isCommunityId } from "@/lib/community/id"
import { isPlausibleServerActionId } from "@/lib/server-action-id"

const intlMiddleware = createMiddleware(routing)
// Client Router work must resolve a locale from its explicitly localized URL,
// but only a document navigation may persist it as a visitor preference.
const intlPrefetchMiddleware = createMiddleware({ ...routing, localeCookie: false })

const BOT_UA_REGEX = /bot|crawler|spider|crawling|slurp|facebookexternalhit/i

const REQUEST_ID_HEADER = "x-aat-request-id"
const COMMUNITY_ROUTE_HEADER = "x-aat-community-route"

const SESSION_GUARDED_PATHS = ["/dashboard", "/settings", "/admin", "/notifications"]

// Routes that intentionally live outside the [locale] segment (English-only or admin).
// Locale-prefixed visits are bridged back below so the language switcher can
// still persist a visitor's site-chrome preference before loading these routes.
const NON_LOCALIZED_PREFIXES = [
  "/admin",
  "/compare",
  "/alternatives",
  "/tools",
  "/community",
  "/design-preview",
]

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

function isCommunityRoute(pathname: string): boolean {
  return pathname === "/community" || pathname.startsWith("/community/")
}

/**
 * A pending RSC request from the previously rendered locale can finish after
 * a full locale switch. next-intl synchronizes its locale cookie from every
 * localized response, so no Client Router request may write that preference.
 */
function isClientRouterRequest(request: NextRequest): boolean {
  return (
    // Next's standalone adapter retains this Client Router header while it
    // consumes the protocol-only `rsc` and `next-router-prefetch` headers.
    request.headers.has("next-url") ||
    request.headers.get("rsc") === "1" ||
    request.headers.get("next-router-prefetch") === "1" ||
    request.headers.get("purpose") === "prefetch"
  )
}

function normalizeCommunityPostId(rawPostId: string): { encoded: string; decoded: string } | null {
  try {
    const decoded = decodeURIComponent(rawPostId)
    return decoded ? { decoded, encoded: encodeURIComponent(decoded) } : null
  } catch {
    // Leave malformed path escapes to Next's normal 404 handling rather than
    // turning an invalid URL into a redirect target.
    return null
  }
}

function communityLegacyDestination(pathname: string): string | null {
  // The old detail editor route was `/community/[postId]/edit`. It can use a
  // name that is static at the one-segment level (for example `new`), so test
  // this two-segment form before excluding static direct routes below.
  const legacyEdit = /^\/community\/([^/]+)\/edit$/.exec(pathname)
  if (legacyEdit?.[1]) {
    const postId = normalizeCommunityPostId(legacyEdit[1])
    return postId ? `/community/t/${postId.encoded}/edit` : null
  }

  const legacyPost = /^\/community\/([^/]+)$/.exec(pathname)
  if (!legacyPost?.[1]) return null
  const postId = normalizeCommunityPostId(legacyPost[1])
  if (!postId) return null

  if (postId.decoded === "mine") return "/community?view=mine"
  if (postId.decoded === "saved") return "/community?view=saved"

  // These are real static routes, not early post-detail aliases.
  if (["new", "moderation", "t"].includes(postId.decoded)) return null
  return `/community/t/${postId.encoded}`
}

function isUnusableCanonicalCommunityThreadPath(pathname: string): boolean {
  // `/community/t` is a route namespace rather than a discussion. Returning
  // here preserves its HTTP 404 even though the root layout is streamable.
  if (pathname === "/community/t") return true

  // The only current descendants of the canonical thread namespace are the
  // detail page and its editor. Any other descendant is known to miss before
  // App Router rendering begins; leaving it to the route tree would let the
  // streamable root layout commit a 200 response first. Add a supported shape
  // here whenever a new canonical thread child route is introduced.
  if (!pathname.startsWith("/community/t/")) return false

  const match = /^\/community\/t\/([^/]+)(?:\/edit)?$/.exec(pathname)
  if (!match?.[1]) return true
  const postId = normalizeCommunityPostId(match[1])
  return !postId || !isCommunityId(postId.decoded)
}

/**
 * This runs before rendering, so an unavailable forum keeps a real HTTP 404
 * even when the shared root layout has already become streamable. Bracket
 * access preserves the runtime-configurable standalone environment value.
 */
function isCommunityEnabled(): boolean {
  return process.env["COMMUNITY_ENABLED"] === "1"
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

function communityPathNotFoundResponse(request: NextRequest, requestId: string) {
  // Preserve the original URL while rendering the existing not-found UI. The
  // Proxy status is set before the route tree can stream a successful header.
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set(REQUEST_ID_HEADER, requestId)
  requestHeaders.set(COMMUNITY_ROUTE_HEADER, "1")
  return withRequestId(
    NextResponse.rewrite(new URL("/community/t", request.url), {
      status: 404,
      request: { headers: requestHeaders },
    }),
    requestId,
  )
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const requestId = requestIdFor(request)
  const clientRouterRequest = isClientRouterRequest(request)
  // This marker is a Proxy-to-renderer capability, never a client-controlled
  // request option. Strip an incoming copy before selectively adding it below.
  request.headers.delete(COMMUNITY_ROUTE_HEADER)

  const serverActionId = request.headers.get("next-action")
  if (serverActionId && !isPlausibleServerActionId(serverActionId)) {
    return withRequestId(new NextResponse(null, { status: 404 }), requestId)
  }

  // next-intl correctly builds /zh/community when a visitor changes their
  // language from an English-only route. Redirect it to the canonical route
  // after storing the chosen locale, rather than making the switch appear to
  // do nothing or serving a 404 under a locale segment.
  const localeMatch = pathname.match(LEADING_LOCALE_REGEX)
  const unlocalizedPath = stripLocale(pathname)
  if (localeMatch && isNonLocalized(unlocalizedPath)) {
    const destination = new URL(unlocalizedPath, request.url)
    destination.search = request.nextUrl.search
    const response = NextResponse.redirect(destination)
    if (!clientRouterRequest)
      response.cookies.set("NEXT_LOCALE", localeMatch[1]!, { path: "/", sameSite: "lax" })
    return withRequestId(response, requestId)
  }

  const legacyDestination = communityLegacyDestination(pathname)
  if (legacyDestination) {
    return withRequestId(
      NextResponse.redirect(new URL(legacyDestination, request.url), 308),
      requestId,
    )
  }

  // A malformed thread identifier and the bare `/community/t` namespace are
  // known before rendering. Reject them here because `notFound()` after a
  // streamed root layout otherwise has to retain a 200 response status.
  if (isUnusableCanonicalCommunityThreadPath(pathname)) {
    return communityPathNotFoundResponse(request, requestId)
  }

  // Pages that call `notFound()` after the root layout starts streaming can
  // otherwise produce a 200 response with a not-found body. Reject canonical
  // forum routes before rendering while the flag is closed.
  if (isCommunityRoute(pathname) && !isCommunityEnabled()) {
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
    // The root layout has to retain the visitor's chosen locale for the shared
    // chrome, while the forum document itself is English. Forward a trusted
    // request-only marker rather than deriving it from an untrusted URL header.
    const requestHeaders = new Headers(request.headers)
    if (isCommunityRoute(pathname)) {
      // The generated request ID must use the same Proxy-to-renderer channel
      // so slow Community logs correlate with the response seen by a visitor.
      requestHeaders.set(REQUEST_ID_HEADER, requestId)
      requestHeaders.set(COMMUNITY_ROUTE_HEADER, "1")
    }
    return withRequestId(NextResponse.next({ request: { headers: requestHeaders } }), requestId)
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

  const response = (clientRouterRequest ? intlPrefetchMiddleware : intlMiddleware)(request)
  return withRequestId(response, requestId)
}

export const config = {
  matcher: [
    "/((?!api|_next|_vercel|.*\\..*|sitemap.xml|robots.txt|feed.xml|llms.txt|favicon.ico).*)",
  ],
}
