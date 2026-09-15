import { beforeEach, describe, expect, it, vi } from "vitest"

import { CommunityError, emptyDraft } from "@/lib/community/contracts"
import {
  deleteCommunityReply,
  editCommunityPost,
  editCommunityReply,
  loadMoreCommunityPosts,
  moderateCommunityPost,
  moderateCommunityReply,
  publishCommunityPost,
  replyToCommunityPost,
  reportCommunityPost,
  reportCommunityReply,
  resolveCommunityReport,
  saveCommunityDraft,
  setCommunityBookmark,
  setCommunityVote,
} from "@/app/actions/community"

const mocks = vi.hoisted(() => ({
  getService: vi.fn(),
  pageRead: vi.fn(),
  searchRead: vi.fn(),
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}))

vi.mock("@/lib/community/server", () => ({ getCommunityServerService: mocks.getService }))
vi.mock("@/lib/community/read-limits", () => ({
  assertCommunityPageReadAllowed: mocks.pageRead,
  assertCommunitySearchAllowed: mocks.searchRead,
}))
vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
  revalidateTag: mocks.revalidateTag,
}))

const post = {
  id: "8e1d22c0-e6dd-44e3-9ce1-b57f2b0a2e20",
  authorId: "member",
  author: "Member",
  type: "Shipped" as const,
  title: "A launch update",
  body: "A concrete release note with enough context to publish.",
  votes: 0,
  voted: false,
  saved: false,
  replies: [],
  state: "public" as const,
  locked: false,
  pinned: false,
  version: 1,
  createdAt: Date.now(),
}

describe("community server actions", () => {
  const service = {
    edit: vi.fn(),
    editForNavigation: vi.fn(),
    publish: vi.fn(),
    publishForNavigation: vi.fn(),
    saveDraft: vi.fn(),
    setVote: vi.fn(),
    setBookmark: vi.fn(),
    report: vi.fn(),
    reportReply: vi.fn(),
    resolveReport: vi.fn(),
    list: vi.fn(),
    moderate: vi.fn(),
    moderateWithOutcome: vi.fn(),
    moderateReply: vi.fn(),
    replyTo: vi.fn(),
    editReply: vi.fn(),
    deleteReply: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getService.mockReturnValue(service)
    mocks.pageRead.mockResolvedValue(undefined)
    mocks.searchRead.mockResolvedValue(undefined)
  })

  it("uses navigation-only post mutations while retaining content invalidation", async () => {
    const draft = { ...emptyDraft(), body: post.body }
    service.publishForNavigation.mockResolvedValue(post.id)
    service.editForNavigation.mockResolvedValue(undefined)

    await expect(publishCommunityPost(draft, crypto.randomUUID())).resolves.toEqual({
      ok: true,
      value: post.id,
    })
    await expect(editCommunityPost(post.id, draft, post.version)).resolves.toEqual({
      ok: true,
      value: undefined,
    })

    expect(service.publishForNavigation).toHaveBeenCalledWith(draft, expect.any(String))
    expect(service.editForNavigation).toHaveBeenCalledWith(post.id, draft, post.version)
    expect(service.publish).not.toHaveBeenCalled()
    expect(service.edit).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/community")
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/community/t/${post.id}`)
    expect(mocks.revalidateTag).toHaveBeenCalledWith("sitemap-entries", "max")
  })

  it("returns typed, non-sensitive failures from service errors", async () => {
    service.setVote.mockRejectedValue(new Error("postgres://private-secret"))

    await expect(setCommunityVote(post.id, true)).resolves.toEqual({
      ok: false,
      error: {
        code: "retryable",
        message: "Community data is temporarily unavailable. Please retry.",
      },
    })
  })

  it("returns compact reactions without refreshing dynamic community routes", async () => {
    const vote = { id: post.id, kind: "vote" as const, votes: 1, voted: true }
    const bookmark = { id: post.id, kind: "bookmark" as const, saved: true }
    service.setVote.mockResolvedValue(vote)
    service.setBookmark.mockResolvedValue(bookmark)

    await expect(setCommunityVote(post.id, true)).resolves.toEqual({ ok: true, value: vote })
    await expect(setCommunityBookmark(post.id, true)).resolves.toEqual({
      ok: true,
      value: bookmark,
    })

    expect(service.setVote).toHaveBeenCalledWith(post.id, true)
    expect(service.setBookmark).toHaveBeenCalledWith(post.id, true)
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
    expect(mocks.revalidateTag).not.toHaveBeenCalled()
  })

  it("avoids route invalidation for private drafts and reports", async () => {
    const draft = { ...emptyDraft(), body: post.body }
    const reason = "This content needs a moderator review."
    const replyId = "4b8a7914-1436-4c38-b5ee-8c49e26703b3"
    service.saveDraft.mockResolvedValue(undefined)
    service.report.mockResolvedValue(undefined)
    service.reportReply.mockResolvedValue(undefined)

    await expect(saveCommunityDraft(draft)).resolves.toEqual({ ok: true, value: undefined })
    await expect(reportCommunityPost(post.id, reason)).resolves.toEqual({
      ok: true,
      value: undefined,
    })
    await expect(reportCommunityReply(replyId, reason)).resolves.toEqual({
      ok: true,
      value: undefined,
    })

    expect(service.saveDraft).toHaveBeenCalledWith(draft)
    expect(service.report).toHaveBeenCalledWith(post.id, reason)
    expect(service.reportReply).toHaveBeenCalledWith(replyId, reason)
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
    expect(mocks.revalidateTag).not.toHaveBeenCalled()
  })

  it("lets the local moderation queue resolve a report without route invalidation", async () => {
    const reportId = "e1c84cf2-e7cb-49f9-9d77-04ae3fe85515"
    service.resolveReport.mockResolvedValue(undefined)

    await expect(resolveCommunityReport(reportId)).resolves.toEqual({
      ok: true,
      value: undefined,
    })

    expect(service.resolveReport).toHaveBeenCalledWith(reportId)
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
    expect(mocks.revalidateTag).not.toHaveBeenCalled()
  })

  it("refreshes changed public content without rereading the unchanged moderation queue", async () => {
    const replyId = "b0a1fba7-eecf-4a47-952d-1b0b4b2104f6"
    const reason = "The moderator reviewed the reported reply."
    service.moderateWithOutcome.mockResolvedValue(true)
    service.moderateReply.mockResolvedValue({ threadId: post.id, changed: true })

    await expect(moderateCommunityPost(post.id, "hide")).resolves.toEqual({
      ok: true,
      value: undefined,
    })
    await expect(moderateCommunityReply(replyId, "hide", reason)).resolves.toEqual({
      ok: true,
      value: undefined,
    })

    expect(service.moderateWithOutcome).toHaveBeenCalledWith(post.id, "hide")
    expect(service.moderateReply).toHaveBeenCalledWith(replyId, "hide", reason)
    expect(mocks.revalidatePath).toHaveBeenCalledTimes(4)
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/community")
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/community/t/${post.id}`)
    expect(mocks.revalidatePath).not.toHaveBeenCalledWith("/community/moderation")
    expect(mocks.revalidateTag).toHaveBeenCalledOnce()
    expect(mocks.revalidateTag).toHaveBeenCalledWith("sitemap-entries", "max")
  })

  it("skips public invalidation after a desired-state moderation retry", async () => {
    const replyId = "6de21258-9244-4935-bb1a-7f2827d836b0"
    const reason = "The reply already has the requested moderation state."
    service.moderate.mockResolvedValue(undefined)
    service.moderateWithOutcome.mockResolvedValue(false)
    service.moderateReply.mockResolvedValue({ threadId: post.id, changed: false })

    await expect(moderateCommunityPost(post.id, "hide")).resolves.toEqual({
      ok: true,
      value: undefined,
    })
    await expect(moderateCommunityReply(replyId, "hide", reason)).resolves.toEqual({
      ok: true,
      value: undefined,
    })

    expect(service.moderateWithOutcome).toHaveBeenCalledWith(post.id, "hide")
    expect(service.moderateReply).toHaveBeenCalledWith(replyId, "hide", reason)
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
    expect(mocks.revalidateTag).not.toHaveBeenCalled()
  })

  it("meters cursor-page actions before they call the list service", async () => {
    mocks.pageRead.mockRejectedValue(
      new CommunityError(
        "retryable",
        "Too many community requests. Please wait before trying again",
      ),
    )
    await expect(
      loadMoreCommunityPosts({
        view: "all",
        type: "All",
        sort: "Latest",
        search: "",
        cursor: "cursor",
      }),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "retryable",
        message: "Too many community requests. Please wait before trying again",
      },
    })
    expect(service.list).not.toHaveBeenCalled()
    expect(mocks.searchRead).not.toHaveBeenCalled()
  })

  it("applies the search budget to search cursors before listing posts", async () => {
    mocks.searchRead.mockRejectedValue(
      new CommunityError(
        "retryable",
        "Too many community searches. Please wait before trying again",
      ),
    )

    await expect(
      loadMoreCommunityPosts({
        view: "all",
        type: "All",
        sort: "Latest",
        search: "release",
        cursor: "cursor",
      }),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "retryable",
        message: "Too many community searches. Please wait before trying again",
      },
    })

    expect(mocks.pageRead).toHaveBeenCalledOnce()
    expect(mocks.searchRead).toHaveBeenCalledWith("release")
    expect(service.list).not.toHaveBeenCalled()
  })

  it("returns locally mergeable reply writes without invalidating community routes", async () => {
    const replyId = "b0a1fba7-eecf-4a47-952d-1b0b4b2104f6"
    const reply = {
      id: replyId,
      authorId: "member",
      author: "Member",
      body: "A clearer reply with useful context.",
      state: "public" as const,
      createdAt: Date.now(),
      version: 1,
    }
    service.replyTo.mockResolvedValue(reply)
    service.editReply.mockResolvedValue(undefined)
    service.deleteReply.mockResolvedValue(undefined)

    await expect(replyToCommunityPost(post.id, reply.body, crypto.randomUUID())).resolves.toEqual({
      ok: true,
      value: reply,
    })

    await expect(editCommunityReply(replyId, reply.body, 1)).resolves.toEqual({
      ok: true,
      value: undefined,
    })
    await expect(deleteCommunityReply(replyId, 2)).resolves.toEqual({
      ok: true,
      value: undefined,
    })

    expect(service.replyTo).toHaveBeenCalledWith(post.id, reply.body, expect.any(String), undefined)
    expect(service.editReply).toHaveBeenCalledWith(replyId, reply.body, 1)
    expect(service.deleteReply).toHaveBeenCalledWith(replyId, 2)
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
    expect(mocks.revalidateTag).not.toHaveBeenCalled()
  })
})
