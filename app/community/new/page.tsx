import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { CommunityError, type FeedQuery } from "@/lib/community/contracts"
import { loadCommunityComposerPage } from "@/lib/community/page-loader"
import { CommunityComposerClient } from "@/components/community/community-composer-client"
import { CommunityPageShell } from "@/components/community/community-page-shell"

export const metadata: Metadata = {
  title: "Share an update | aat.ee Community",
  robots: { index: false, follow: false },
}

const feedQuery: FeedQuery = { view: "all", type: "All", sort: "Latest", search: "" }

async function loadComposerForPage() {
  try {
    return await loadCommunityComposerPage()
  } catch (error) {
    if (error instanceof CommunityError && error.code === "missing") notFound()
    throw error
  }
}

export default async function CommunityNewPage() {
  const initial = await loadComposerForPage()
  return (
    <CommunityPageShell query={feedQuery} viewer={initial.viewer}>
      <h1 tabIndex={-1}>Share your next step.</h1>
      <CommunityComposerClient
        initialDraft={initial.draft}
        products={initial.products}
        viewer={initial.viewer}
      />
    </CommunityPageShell>
  )
}
