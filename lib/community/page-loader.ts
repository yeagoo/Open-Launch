import "server-only"

import { connection } from "next/server"

import { CommunityError, type FeedQuery } from "./contracts"
import { isCommunitySearchAllowed } from "./read-limits"
import { getCommunityServerService, isCommunityEnabled } from "./server"

/**
 * Pages call this before any environment access. `connection()` keeps the
 * feature flag runtime-configurable in a standalone build, so a rollback does
 * not depend on a rebuild.
 */
async function enabledService() {
  await connection()
  if (!isCommunityEnabled()) throw new CommunityError("missing", "Community is not available")
  return getCommunityServerService()
}

export async function loadCommunityFeedPage(query: FeedQuery) {
  const service = await enabledService()
  if (await isCommunitySearchAllowed(query.search)) return service.loadFeedPage(query)
  return {
    feed: { posts: [] },
    viewer: await service.loadViewer(),
    rateLimited: true,
  }
}

export async function loadCommunityPostPage(threadId: string) {
  return (await enabledService()).loadPostPage(threadId)
}

export async function loadCommunityPostEditorPage(threadId: string) {
  return (await enabledService()).loadPostEditorPage(threadId)
}

export async function loadCommunityComposerPage() {
  return (await enabledService()).loadComposerPage()
}

export async function loadCommunityModerationPage() {
  return (await enabledService()).loadModerationPage()
}
