import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { CommunityError, type FeedQuery } from "@/lib/community/contracts"
import { loadCommunityModerationPage } from "@/lib/community/page-loader"
import { CommunityModerationClient } from "@/components/community/community-moderation-client"
import { CommunityPageShell } from "@/components/community/community-page-shell"

export const metadata: Metadata = {
  title: "Community moderation | aat.ee",
  robots: { index: false, follow: false },
}

const feedQuery: FeedQuery = { view: "all", type: "All", sort: "Latest", search: "" }

async function loadModerationForPage() {
  try {
    return await loadCommunityModerationPage()
  } catch (error) {
    if (
      error instanceof CommunityError &&
      (error.code === "missing" || error.code === "unauthorized" || error.code === "forbidden")
    )
      notFound()
    throw error
  }
}

export default async function CommunityModerationPage() {
  const initial = await loadModerationForPage()
  return (
    <CommunityPageShell query={feedQuery} viewer={initial.viewer}>
      <CommunityModerationClient initialReports={initial.reports} />
    </CommunityPageShell>
  )
}
