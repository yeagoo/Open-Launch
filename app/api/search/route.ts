import { unstable_cache } from "next/cache"
import { headers } from "next/headers"
import { NextRequest, NextResponse } from "next/server"

import { db } from "@/drizzle/db"
import { category, tag, tagModerationStatus } from "@/drizzle/db/schema"
import { and, eq, ilike } from "drizzle-orm"

import { getClientIp } from "@/lib/client-ip"
import { API_RATE_LIMITS } from "@/lib/constants"
import { checkRateLimit } from "@/lib/rate-limit"
import { searchProjects } from "@/lib/search-projects"

// Définir le type de retour pour la recherche
export interface SearchResult {
  id: string
  name: string
  slug: string | null
  description: string | null
  logoUrl: string | null
  type: "project" | "category" | "tag"
}

export interface SearchResponse {
  results: SearchResult[]
  totalCount: number
}

// Category/tag matches are small lookup tables — ILIKE is plenty there.
// They're only included on the first page (the ⌘K palette use case);
// the results page paginates projects only.
async function searchCategories(query: string, limit: number): Promise<SearchResult[]> {
  const categories = await db
    .select({ id: category.id, name: category.name })
    .from(category)
    .where(ilike(category.name, `%${query}%`))
    .limit(limit)
  return categories.map((c) => ({
    id: c.id,
    name: c.name,
    slug: null,
    description: null,
    logoUrl: null,
    type: "category" as const,
  }))
}

async function searchTags(query: string, limit: number): Promise<SearchResult[]> {
  const tags = await db
    .select({ id: tag.id, name: tag.name, slug: tag.slug })
    .from(tag)
    .where(
      and(ilike(tag.name, `%${query}%`), eq(tag.moderationStatus, tagModerationStatus.APPROVED)),
    )
    .limit(limit)
  return tags.map((t) => ({
    id: t.id,
    name: `#${t.name}`,
    slug: t.slug,
    description: null,
    logoUrl: null,
    type: "tag" as const,
  }))
}

const getSearchResults = unstable_cache(
  async (query: string, limit: number, offset: number): Promise<SearchResponse> => {
    if (!query || query.trim().length < 2) {
      return { results: [], totalCount: 0 }
    }

    try {
      const projectPage = await searchProjects({ query, limit, offset })

      const projectResults: SearchResult[] = projectPage.hits.map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        description: p.description,
        logoUrl: p.logoUrl,
        type: "project" as const,
      }))

      if (offset > 0) {
        return { results: projectResults, totalCount: projectPage.totalCount }
      }

      const [categories, tags] = await Promise.all([
        searchCategories(query.trim(), 5),
        searchTags(query.trim(), 5),
      ])

      return {
        results: [...projectResults, ...categories, ...tags].slice(0, limit),
        totalCount: projectPage.totalCount,
      }
    } catch (error) {
      // Re-throw rather than returning []: unstable_cache would otherwise
      // cache the empty result for the full revalidate window, so users keep
      // seeing "no results" for up to 60s after the DB recovers. A genuine
      // no-match query returns [] above without reaching this catch; GET turns
      // this throw into a clean 500 instead of a misleading empty 200.
      console.error("[Search API] Error searching:", error)
      throw error
    }
  },
  ["search-results"],
  { revalidate: 60 }, // Revalider le cache toutes les 60 secondes
)

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
