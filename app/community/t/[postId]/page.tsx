import { cache } from "react"
import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { CommunityError, type FeedQuery } from "@/lib/community/contracts"
import { communityPostDescription, communityPostHeadline } from "@/lib/community/metadata"
import { loadCommunityPostPage } from "@/lib/community/page-loader"
import { CommunityDetailClient } from "@/components/community/community-detail-client"
import { CommunityPageShell } from "@/components/community/community-page-shell"
import { CommunityThreadSchema } from "@/components/seo/structured-data"

const baseUrl = process.env.NEXT_PUBLIC_URL || "https://www.aat.ee"
// React cache is request-scoped in an RSC render. It avoids a second
// permission-aware database read when metadata and the page render together.
const loadPostPage = cache(loadCommunityPostPage)

function isUnavailablePostError(error: unknown): boolean {
  return (
    error instanceof CommunityError && (error.code === "missing" || error.code === "validation")
  )
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ postId: string }>
}): Promise<Metadata> {
  const { postId } = await params
  try {
    const { post } = await loadPostPage(postId)
    if (post.state !== "public") {
      return {
        title: "Community post | aat.ee",
        robots: { index: false, follow: true },
      }
    }
    const headline = communityPostHeadline(post)
    return {
      title: `${headline} | Community | aat.ee`,
      description: communityPostDescription(post),
      alternates: { canonical: `${baseUrl}/community/t/${encodeURIComponent(post.id)}` },
      robots: { index: true, follow: true },
      openGraph: {
        title: `${headline} | Community | aat.ee`,
        description: communityPostDescription(post),
        type: "article",
        url: `${baseUrl}/community/t/${encodeURIComponent(post.id)}`,
      },
    }
  } catch {
    // The page itself renders the correct 404 or recovery boundary. Metadata
    // must never expose an unavailable post to a crawler.
    return { title: "Community post | aat.ee", robots: { index: false, follow: true } }
  }
}

const feedQuery: FeedQuery = { view: "all", type: "All", sort: "Latest", search: "" }

async function loadPostForPage(postId: string) {
  try {
    return await loadPostPage(postId)
  } catch (error) {
    if (isUnavailablePostError(error)) notFound()
    throw error
  }
}

export default async function CommunityPostPage({
  params,
}: {
  params: Promise<{ postId: string }>
}) {
  const { postId } = await params
  const initial = await loadPostForPage(postId)
  return (
    <>
      {initial.post.state === "public" && <CommunityThreadSchema post={initial.post} />}
      <CommunityPageShell query={feedQuery} viewer={initial.viewer}>
        <CommunityDetailClient initialPost={initial.post} viewer={initial.viewer} />
      </CommunityPageShell>
    </>
  )
}
