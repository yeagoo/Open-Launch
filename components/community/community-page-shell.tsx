import type { ReactNode } from "react"
import Link from "next/link"

import type { CommunityViewer, FeedQuery } from "@/lib/community/contracts"

import { CommunitySidebar } from "./community-sidebar"
import { CommunityShell } from "./community-ui"

export function CommunityPageShell({
  children,
  query,
  viewer,
}: {
  children: ReactNode
  query: FeedQuery
  viewer: CommunityViewer
}) {
  return (
    <CommunityShell
      mode="live"
      showHeader={false}
      composeHref="/community/new"
      linkComponent={Link}
      sidebar={<CommunitySidebar query={query} viewer={viewer} />}
    >
      {children}
    </CommunityShell>
  )
}
