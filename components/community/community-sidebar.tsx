"use client"

import { useRouter } from "next/navigation"

import { type CommunityViewer, type FeedQuery } from "@/lib/community/contracts"
import { communityFeedHref } from "@/lib/community/urls"

import { PostTypeNav } from "./community-ui"

export function CommunitySidebar({ query, viewer }: { query: FeedQuery; viewer: CommunityViewer }) {
  const router = useRouter()
  return (
    <PostTypeNav
      query={query}
      role={viewer.role}
      onChange={(next) => router.push(communityFeedHref({ ...next, cursor: undefined }))}
      onAdmin={() => router.push("/community/moderation")}
    />
  )
}
