import { headers } from "next/headers"
import { NextRequest, NextResponse } from "next/server"

import { getClientIp } from "@/lib/client-ip"
import { API_RATE_LIMITS } from "@/lib/constants"
import { checkRateLimit } from "@/lib/rate-limit"
import { getSearchResults } from "@/lib/search-service"

export async function GET(request: NextRequest) {
  try {
    // Obtenir l'IP du client (cf-connecting-ip d'abord — x-forwarded-for est falsifiable)
    const headersList = await headers()
    const ip = getClientIp(headersList)

    // Vérifier la limite de taux avec les constantes spécifiques pour la recherche
    const rateLimitResult = await checkRateLimit(
      `search-api:${ip}`,
      API_RATE_LIMITS.SEARCH.REQUESTS,
      API_RATE_LIMITS.SEARCH.WINDOW,
    )

    if (!rateLimitResult.success) {
      return NextResponse.json(
        {
          error: "rate_limit_exceeded",
          message: `Too many requests. Please wait ${rateLimitResult.reset} seconds before trying again.`,
          reset: rateLimitResult.reset,
        },
        {
          status: 429,
          headers: {
            "X-RateLimit-Limit": API_RATE_LIMITS.SEARCH.REQUESTS.toString(),
            "X-RateLimit-Remaining": rateLimitResult.remaining.toString(),
            "X-RateLimit-Reset": rateLimitResult.reset.toString(),
          },
        },
      )
    }

    // Récupérer les paramètres de recherche
    const searchParams = request.nextUrl.searchParams
    const query = searchParams.get("q") || ""
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "10", 10) || 10))
    // Offset is capped to the same deep-page window as the results page:
    // an unbounded offset would make Postgres sort/skip huge sets AND
    // create unbounded unstable_cache keys.
    const offset = Math.min(5000, Math.max(0, parseInt(searchParams.get("offset") || "0", 10) || 0))

    const { results, totalCount } = await getSearchResults(query, limit, offset)

    return NextResponse.json(
      { results, totalCount },
      {
        headers: {
          "X-RateLimit-Limit": API_RATE_LIMITS.SEARCH.REQUESTS.toString(),
          "X-RateLimit-Remaining": rateLimitResult.remaining.toString(),
          "X-RateLimit-Reset": rateLimitResult.reset.toString(),
        },
      },
    )
  } catch (error) {
    console.error("[Search API] Error processing request:", error)
    return NextResponse.json(
      {
        error: "search_failed",
        message: "An error occurred while processing your search request. Please try again later.",
      },
      { status: 500 },
    )
  }
}
