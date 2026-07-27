import { Metadata } from "next"
import { headers } from "next/headers"
import Link from "next/link"
import { redirect } from "next/navigation"

import { RiAppsLine, RiSearchLine } from "@remixicon/react"
import { getTranslations } from "next-intl/server"

import { stripHtml } from "@/lib/ai-input"
import { getClientIp } from "@/lib/client-ip"
import { API_RATE_LIMITS } from "@/lib/constants"
import { checkRateLimit } from "@/lib/rate-limit"
import { searchProjects } from "@/lib/search-projects"

export const dynamic = "force-dynamic"

const PAGE_SIZE = 20

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}): Promise<Metadata> {
  const { q } = await searchParams
  return {
    title: q ? `Search: ${q} | aat.ee` : "Search | aat.ee",
    // Result pages are thin, parameter-driven content — don't index them.
    robots: { index: false, follow: true },
  }
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>
}) {
  const { q = "", page: pageParam } = await searchParams
  const t = await getTranslations("search")
  const query = q.trim()
  // Cap the page BEFORE any DB work: a hand-crafted page=999999999 would
  // otherwise force an expensive search + count with a huge OFFSET before
  // the out-of-range redirect below ever runs.
  const MAX_PAGE = 100
  const page = Math.min(MAX_PAGE, Math.max(1, parseInt(pageParam || "1", 10) || 1))

  // The page calls searchProjects directly — no API rate limit or
  // unstable_cache in front. Without its own limiter, bots could force
  // the zero-match full-similarity fallback (a full-table scan) with
  // unique garbage terms. Same budget as /api/search.
  const ip = getClientIp(await headers())
  const rate = await checkRateLimit(
    `search-page:${ip}`,
    API_RATE_LIMITS.SEARCH.REQUESTS,
    API_RATE_LIMITS.SEARCH.WINDOW,
  )
  const rateLimited = !rate.success

  const { hits, totalCount } =
    query && !rateLimited
      ? await searchProjects({
          query,
          limit: PAGE_SIZE,
          offset: (page - 1) * PAGE_SIZE,
        })
      : { hits: [], totalCount: 0 }

  // Deep pages beyond MAX_PAGE are neither served nor advertised (a Next
  // link to page 101 would just clamp back to 100 — a pagination loop).
  const totalPages = Math.min(MAX_PAGE, Math.max(1, Math.ceil(totalCount / PAGE_SIZE)))

  // Out-of-range page (hand-edited URL, or results shrank since the link
  // was made): send the user to the real last page instead of showing
  // "no results" alongside "Page 99 of 3".
  if (totalCount > 0 && page > totalPages) {
    redirect(`/search?q=${encodeURIComponent(query)}&page=${totalPages}`)
  }

  return (
    <main className="bg-secondary/20 min-h-screen">
      <div className="container mx-auto max-w-4xl px-4 pt-8 pb-12">
        <h1 className="mb-6 flex items-center gap-2 text-xl font-bold sm:text-2xl">
          <RiSearchLine className="h-6 w-6" />
          {query ? t("resultsFor", { query }) : t("placeholder")}
        </h1>

        {rateLimited && (
          <div className="bg-card border-border rounded-xl border border-dashed py-16 text-center">
            <p className="text-muted-foreground">Too many requests. Please try again later.</p>
          </div>
        )}
        {!rateLimited && query && hits.length === 0 && (
          <div className="bg-card border-border rounded-xl border border-dashed py-16 text-center">
            <p className="text-muted-foreground">{t("noResultsFor", { query })}</p>
          </div>
        )}

        <div className="space-y-3">
          {hits.map((hit) => (
            <Link
              key={hit.id}
              href={`/projects/${hit.slug}`}
              className="bg-card border-border hover:border-primary/50 flex items-center gap-4 rounded-xl border p-4 transition-colors"
            >
              {hit.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={hit.logoUrl}
                  alt={hit.name}
                  className="border-border h-12 w-12 flex-shrink-0 rounded-full border object-cover"
                />
              ) : (
                <div className="bg-primary/10 flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full">
                  <RiAppsLine className="text-primary h-5 w-5" />
                </div>
              )}
              <div className="min-w-0">
                <div className="truncate font-semibold">{hit.name}</div>
                {hit.description && (
                  <p className="text-muted-foreground line-clamp-2 text-sm">
                    {stripHtml(hit.description, 200)}
                  </p>
                )}
              </div>
            </Link>
          ))}
        </div>

        {totalPages > 1 && (
          <div className="mt-8 flex items-center justify-center gap-4">
            {page > 1 && (
              <Link
                href={`/search?q=${encodeURIComponent(query)}&page=${page - 1}`}
                className="border-border hover:bg-muted rounded-md border px-4 py-2 text-sm transition-colors"
              >
                {t("prevPage")}
              </Link>
            )}
            <span className="text-muted-foreground text-sm">
              {t("pageOf", { page, total: totalPages })}
            </span>
            {page < totalPages && (
              <Link
                href={`/search?q=${encodeURIComponent(query)}&page=${page + 1}`}
                className="border-border hover:bg-muted rounded-md border px-4 py-2 text-sm transition-colors"
              >
                {t("nextPage")}
              </Link>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
