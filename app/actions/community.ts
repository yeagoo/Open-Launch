"use server"

import { revalidatePath, revalidateTag } from "next/cache"

import { SITEMAP_ENTRIES_TAG } from "@/lib/cache-tags"
import type { CommunityActionResult } from "@/lib/community/action-result"
import {
  CommunityError,
  type CommunityBookmarkState,
  type CommunityReply,
  type CommunityVoteState,
  type FeedPage,
  type FeedQuery,
  type ModerationAction,
  type PostDraft,
} from "@/lib/community/contracts"
import {
  assertCommunityPageReadAllowed,
  assertCommunitySearchAllowed,
} from "@/lib/community/read-limits"
import { getCommunityServerService } from "@/lib/community/server"
import type { ReplyPage } from "@/lib/community/server-types"

const genericFailure = {
  code: "retryable" as const,
  message: "Community data is temporarily unavailable. Please retry.",
}

function actionFailure(error: unknown): CommunityActionResult<never> {
  if (error instanceof CommunityError)
    return { ok: false, error: { code: error.code, message: error.message } }
  return { ok: false, error: genericFailure }
}

async function communityAction<T>(
  operation: (service: ReturnType<typeof getCommunityServerService>) => Promise<T>,
): Promise<CommunityActionResult<T>> {
  try {
    return { ok: true, value: await operation(getCommunityServerService()) }
  } catch (error) {
    return actionFailure(error)
  }
}

function revalidateCommunity(threadId?: string) {
  revalidatePath("/community")
  if (threadId) revalidatePath(`/community/t/${threadId}`)
}

function revalidateCommunitySitemap() {
  revalidateTag(SITEMAP_ENTRIES_TAG, "max")
}

export async function loadMoreCommunityPosts(
  query: FeedQuery,
): Promise<CommunityActionResult<FeedPage>> {
  return communityAction(async (service) => {
    await assertCommunityPageReadAllowed()
    await assertCommunitySearchAllowed(query.search)
    return service.list(query)
  })
}

export async function loadMoreCommunityReplies(
  threadId: string,
  cursor?: string,
): Promise<CommunityActionResult<ReplyPage>> {
  return communityAction(async (service) => {
    await assertCommunityPageReadAllowed()
    return service.listReplies(threadId, cursor)
  })
}

export async function saveCommunityDraft(draft: PostDraft): Promise<CommunityActionResult<void>> {
  return communityAction(async (service) => {
    await service.saveDraft(draft)
  })
}

export async function publishCommunityPost(
  draft: PostDraft,
  requestId: string,
): Promise<CommunityActionResult<string>> {
  return communityAction(async (service) => {
    const threadId = await service.publishForNavigation(draft, requestId)
    revalidateCommunity(threadId)
    revalidateCommunitySitemap()
    return threadId
  })
}

export async function editCommunityPost(
  threadId: string,
  draft: PostDraft,
  version: number,
): Promise<CommunityActionResult<void>> {
  return communityAction(async (service) => {
    await service.editForNavigation(threadId, draft, version)
    revalidateCommunity(threadId)
    revalidateCommunitySitemap()
  })
}

export async function deleteCommunityPost(
  threadId: string,
  version: number,
): Promise<CommunityActionResult<void>> {
  return communityAction(async (service) => {
    await service.delete(threadId, version)
    revalidateCommunity(threadId)
    revalidateCommunitySitemap()
  })
}

export async function setCommunityVote(
  threadId: string,
  desired: boolean,
): Promise<CommunityActionResult<CommunityVoteState>> {
  return communityAction(async (service) => {
    // The client merges this authoritative compact state locally. Community
    // pages are runtime-dynamic, so a later navigation reads current data.
    return service.setVote(threadId, desired)
  })
}

export async function setCommunityBookmark(
  threadId: string,
  desired: boolean,
): Promise<CommunityActionResult<CommunityBookmarkState>> {
  return communityAction(async (service) => {
    // Keep a lightweight interaction from causing a Server Action route refresh.
    return service.setBookmark(threadId, desired)
  })
}

export async function replyToCommunityPost(
  threadId: string,
  body: string,
  requestId: string,
  parentId?: string,
): Promise<CommunityActionResult<CommunityReply>> {
  // The detail client merges the authoritative reply and count locally.
  return communityAction((service) => service.replyTo(threadId, body, requestId, parentId))
}

export async function editCommunityReply(
  replyId: string,
  body: string,
  version: number,
): Promise<CommunityActionResult<void>> {
  return communityAction((service) => service.editReply(replyId, body, version))
}

export async function deleteCommunityReply(
  replyId: string,
  version: number,
): Promise<CommunityActionResult<void>> {
  return communityAction((service) => service.deleteReply(replyId, version))
}

export async function reportCommunityPost(
  threadId: string,
  reason: string,
): Promise<CommunityActionResult<void>> {
  return communityAction(async (service) => {
    await service.report(threadId, reason)
  })
}

export async function reportCommunityReply(
  replyId: string,
  reason: string,
): Promise<CommunityActionResult<void>> {
  return communityAction(async (service) => {
    await service.reportReply(replyId, reason)
  })
}

export async function resolveCommunityReport(
  reportId: string,
): Promise<CommunityActionResult<void>> {
  // The moderation client removes the resolved report from its own queue.
  return communityAction((service) => service.resolveReport(reportId))
}

export async function moderateCommunityPost(
  threadId: string,
  action: ModerationAction,
): Promise<CommunityActionResult<void>> {
  return communityAction(async (service) => {
    const changed = await service.moderateWithOutcome(threadId, action)
    if (!changed) return
    // The pending queue does not project post moderation; public content changed.
    revalidateCommunity(threadId)
    revalidateCommunitySitemap()
  })
}

export async function moderateCommunityReply(
  replyId: string,
  action: "hide" | "restore",
  reason: string,
): Promise<CommunityActionResult<void>> {
  return communityAction(async (service) => {
    const outcome = await service.moderateReply(replyId, action, reason)
    if (!outcome.changed) return
    // The pending queue does not project reply moderation.
    revalidateCommunity(outcome.threadId)
  })
}
