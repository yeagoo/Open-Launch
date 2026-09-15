import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"

import { CommunityError, type FeedQuery } from "@/lib/community/contracts"
import { loadCommunityFeedPage } from "@/lib/community/page-loader"
import {
  communityFeedHref,
  parseCommunityFeedQuery,
  type CommunitySearchParams,
} from "@/lib/community/urls"
import { CommunityFeedClient } from "@/components/community/community-feed-client"
import { CommunityPageShell } from "@/components/community/community-page-shell"

const baseUrl = process.env.NEXT_PUBLIC_URL || "https://www.aat.ee"

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<CommunitySearchParams>
}): Promise<Metadata> {
  const query = parseCommunityFeedQuery(await searchParams)
  const filtered =
    query.view !== "all" || !!query.search || query.type !== "All" || query.sort === "Hot"
  return {
    title: "Community | aat.ee",
    description: "A place for makers to share releases, lessons, questions and next steps.",
    alternates: { canonical: `${baseUrl}/community` },
    robots: filtered ? { index: false, follow: true } : undefined,
    openGraph: {
      title: "Community | aat.ee",
      description: "Build in the open. Learn together.",
      type: "website",
      url: `${baseUrl}/community`,
    },
  }
}

async function loadFeedForPage(query: FeedQuery) {
  try {
    return await loadCommunityFeedPage(query)
  } catch (error) {
    if (!(error instanceof CommunityError)) throw error
    if (error.code === "missing") notFound()
    // A stale Hot cursor should never become a permanent error page. Preserve
    // the visible filters and let the service create a fresh snapshot.
    if (error.code === "conflict" && query.cursor)
      redirect(communityFeedHref({ ...query, cursor: undefined }))
    if (error.code === "validation") redirect("/community")
    throw error
  }
}

export default async function CommunityPage({
  searchParams,
}: {
  searchParams: Promise<CommunitySearchParams>
}) {
  const query = parseCommunityFeedQuery(await searchParams)
  const initial = await loadFeedForPage(query)
  return (
    <CommunityPageShell query={query} viewer={initial.viewer}>
      <CommunityFeedClient initial={initial} query={query} />
    </CommunityPageShell>
  )
}
