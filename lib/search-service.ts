import "server-only"

import { unstable_cache } from "next/cache"

import { db } from "@/drizzle/db"
import { category, tag, tagModerationStatus } from "@/drizzle/db/schema"
import { and, eq, ilike } from "drizzle-orm"

import {
  searchProjects,
  type ProjectSearchHit,
  type ProjectSearchPage,
} from "@/lib/search-projects"
import type { SearchResponse, SearchResult } from "@/lib/search-types"

// The full results page renders 20 rows, while the command palette asks for
// 10. Fetching one canonical 20-row cache page lets those common requests
// share the same DB result; callers still receive exactly the count requested.
const SHARED_PROJECT_SEARCH_PAGE_SIZE = 20
const MAX_PROJECT_SEARCH_LIMIT = 50
const MAX_PROJECT_SEARCH_OFFSET = 5000

function normalizeQuery(query: string) {
  return query.trim()
}

function normalizeLimit(limit: number) {
  if (!Number.isFinite(limit)) return SHARED_PROJECT_SEARCH_PAGE_SIZE
  return Math.min(MAX_PROJECT_SEARCH_LIMIT, Math.max(1, Math.floor(limit)))
}

function normalizeOffset(offset: number) {
  if (!Number.isFinite(offset)) return 0
  return Math.min(MAX_PROJECT_SEARCH_OFFSET, Math.max(0, Math.floor(offset)))
}

// Category/tag matches are small lookup tables. They are included only on
// the first page for the command palette; result pages paginate projects.
async function searchCategories(query: string, limit: number): Promise<SearchResult[]> {
  const categories = await db
    .select({ id: category.id, name: category.name })
    .from(category)
    .where(ilike(category.name, `%${query}%`))
    .limit(limit)

  return categories.map((item) => ({
    id: item.id,
    name: item.name,
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

  return tags.map((item) => ({
    id: item.id,
    name: `#${item.name}`,
    slug: item.slug,
    description: null,
    logoUrl: null,
    type: "tag" as const,
  }))
}

const getCachedProjectSearchPageInner = unstable_cache(
  async (query: string, limit: number, offset: number): Promise<ProjectSearchPage> =>
    searchProjects({ query, limit, offset }),
  ["search-projects-v2"],
  { revalidate: 60 },
)

/**
 * The public project-search result is shared by /search and /api/search.
 * Request-scoped data (IP, headers, cookies) stays in the callers, outside
 * this cached function, as required by Next's cache contract.
 */
export function getCachedProjectSearchPage(
  rawQuery: string,
  limit: number,
  offset: number,
): Promise<ProjectSearchPage> {
  const query = normalizeQuery(rawQuery)
  if (query.length < 2) return Promise.resolve({ hits: [], totalCount: 0 })

  // API callers clamp this to 1–50 and the results page uses 20. Keep the
  // helper bounded as well so a future caller cannot create a broad slice or
  // an unbounded cache key by bypassing the route's normalization.
  const requestedLimit = normalizeLimit(limit)
  const cacheLimit = Math.max(SHARED_PROJECT_SEARCH_PAGE_SIZE, requestedLimit)
  const normalizedOffset = normalizeOffset(offset)

  return getCachedProjectSearchPageInner(query, cacheLimit, normalizedOffset).then(
    (projectPage) => ({
      hits: projectPage.hits.slice(0, requestedLimit),
      totalCount: projectPage.totalCount,
    }),
  )
}

const getCachedTaxonomySearchResults = unstable_cache(
  async (query: string): Promise<SearchResult[]> => {
    const [categories, tags] = await Promise.all([searchCategories(query, 5), searchTags(query, 5)])
    return [...categories, ...tags]
  },
  ["search-taxonomy-v1"],
  { revalidate: 60 },
)

function toProjectSearchResults(hits: ProjectSearchHit[]): SearchResult[] {
  return hits.map((hit) => ({
    id: hit.id,
    name: hit.name,
    slug: hit.slug,
    description: hit.description,
    logoUrl: hit.logoUrl,
    type: "project" as const,
  }))
}

/**
 * Command-palette search includes taxonomy on page one. The project portion
 * shares its cache with the full result page, and independent lookup work is
 * started at the same time as the project search on a cold cache.
 */
export async function getSearchResults(
  rawQuery: string,
  limit: number,
  offset: number,
): Promise<SearchResponse> {
  const query = normalizeQuery(rawQuery)
  if (query.length < 2) return { results: [], totalCount: 0 }
  const normalizedLimit = normalizeLimit(limit)
  const normalizedOffset = normalizeOffset(offset)

  const projectSearch = getCachedProjectSearchPage(query, normalizedLimit, normalizedOffset)
  if (normalizedOffset > 0) {
    const projectPage = await projectSearch
    return {
      results: toProjectSearchResults(projectPage.hits),
      totalCount: projectPage.totalCount,
    }
  }

  const [projectPage, taxonomyResults] = await Promise.all([
    projectSearch,
    getCachedTaxonomySearchResults(query),
  ])

  return {
    results: [...toProjectSearchResults(projectPage.hits), ...taxonomyResults].slice(
      0,
      normalizedLimit,
    ),
    totalCount: projectPage.totalCount,
  }
}
