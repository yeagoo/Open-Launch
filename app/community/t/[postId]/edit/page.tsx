import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { CommunityError, type FeedQuery } from "@/lib/community/contracts"
import { loadCommunityPostEditorPage } from "@/lib/community/page-loader"
import { CommunityComposerClient } from "@/components/community/community-composer-client"
import { CommunityPageShell } from "@/components/community/community-page-shell"

export const metadata: Metadata = {
  title: "Edit community post | aat.ee",
  robots: { index: false, follow: false },
}

const feedQuery: FeedQuery = { view: "all", type: "All", sort: "Latest", search: "" }

function isUnavailablePostError(error: unknown): boolean {
  return (
    error instanceof CommunityError && (error.code === "missing" || error.code === "validation")
  )
}

async function loadEditorForPage(postId: string) {
  try {
    return await loadCommunityPostEditorPage(postId)
  } catch (error) {
    if (isUnavailablePostError(error)) notFound()
    throw error
  }
}

export default async function CommunityEditPage({
  params,
}: {
  params: Promise<{ postId: string }>
}) {
  const { postId } = await params
  const initial = await loadEditorForPage(postId)
  return (
    <CommunityPageShell query={feedQuery} viewer={initial.viewer}>
      <h1 tabIndex={-1}>Edit your update</h1>
      <CommunityComposerClient
        initialDraft={null}
        products={initial.products}
        viewer={initial.viewer}
        post={initial.post}
      />
    </CommunityPageShell>
  )
}
