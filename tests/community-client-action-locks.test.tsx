// @vitest-environment jsdom

import { act, createElement, type ReactNode } from "react"

import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import type {
  CommunityPost,
  CommunityReport,
  FeedQuery,
  PostDraft,
} from "@/lib/community/contracts"
import { CommunityComposerClient } from "@/components/community/community-composer-client"
import { CommunityFeedClient } from "@/components/community/community-feed-client"
import { CommunityModerationClient } from "@/components/community/community-moderation-client"

const mocks = vi.hoisted(() => ({
  bookmark: vi.fn(),
  editPost: vi.fn(),
  loadPosts: vi.fn(),
  moderatePost: vi.fn(),
  moderateReply: vi.fn(),
  publish: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
  resolveReport: vi.fn(),
  saveDraft: vi.fn(),
  toast: vi.fn(),
  vote: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh, replace: mocks.replace }),
}))
vi.mock("next/link", async () => {
  const React = await import("react")
  return {
    default: ({ href, children }: { href: string; children: ReactNode }) =>
      React.createElement("a", { href }, children),
  }
})
vi.mock("sonner", () => ({ toast: { success: mocks.toast } }))
vi.mock("@/app/actions/community", () => ({
  editCommunityPost: mocks.editPost,
  loadMoreCommunityPosts: mocks.loadPosts,
  moderateCommunityPost: mocks.moderatePost,
  moderateCommunityReply: mocks.moderateReply,
  publishCommunityPost: mocks.publish,
  resolveCommunityReport: mocks.resolveReport,
  saveCommunityDraft: mocks.saveDraft,
  setCommunityBookmark: mocks.bookmark,
  setCommunityVote: mocks.vote,
}))
vi.mock("@/components/ui/dialog", async () => {
  const React = await import("react")
  return {
    Dialog: ({ open, children }: { open?: boolean; children: ReactNode }) =>
      open ? React.createElement("div", { role: "dialog" }, children) : null,
    DialogContent: ({ children }: { children: ReactNode }) =>
      React.createElement("div", null, children),
    DialogDescription: ({ children }: { children: ReactNode }) =>
      React.createElement("p", null, children),
    DialogFooter: ({ children }: { children: ReactNode }) =>
      React.createElement("div", null, children),
    DialogHeader: ({ children }: { children: ReactNode }) =>
      React.createElement("div", null, children),
    DialogTitle: ({ children }: { children: ReactNode }) =>
      React.createElement("h2", null, children),
  }
})
vi.mock("@/components/community/community-ui", async () => {
  const React = await import("react")
  return {
    CommunityState: ({ title, children }: { title: string; children?: ReactNode }) =>
      React.createElement("section", null, React.createElement("h2", null, title), children),
    PostActions: () => null,
    PostCard: ({
      post,
      children,
    }: {
      post: { author: string; product?: { name: string } }
      children: ReactNode
    }) =>
      React.createElement(
        "article",
        null,
        React.createElement("span", { "data-testid": "post-author" }, post.author),
        post.product
          ? React.createElement("span", { "data-testid": "post-product" }, post.product.name)
          : null,
        children,
      ),
  }
})

const draft: PostDraft = {
  title: "",
  body: "This post has enough context for the composer validation to accept it.",
  type: "Shipped",
  productId: "",
}
const post: CommunityPost = {
  id: "10000000-0000-4000-8000-000000000020",
  authorId: "author",
  author: "Author",
  type: "Shipped",
  title: "A public update",
  body: draft.body,
  votes: 0,
  voted: false,
  saved: false,
  replies: [],
  replyCount: 0,
  state: "public",
  locked: false,
  pinned: false,
  version: 1,
  createdAt: Date.now(),
}
const feedQuery: FeedQuery = { view: "all", type: "All", sort: "Latest", search: "" }
const report: CommunityReport = {
  id: "10000000-0000-4000-8000-000000000021",
  postId: post.id,
  reason: "The discussion needs a moderator review.",
  snapshot: post.body,
  resolved: false,
}

let root: Root | undefined

beforeAll(() => {
  ;(
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT: boolean
    }
  ).IS_REACT_ACT_ENVIRONMENT = true
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.editPost.mockResolvedValue({ ok: true, value: undefined })
  mocks.loadPosts.mockResolvedValue({ ok: true, value: { posts: [], nextCursor: undefined } })
  mocks.moderatePost.mockResolvedValue({ ok: true, value: undefined })
  mocks.moderateReply.mockResolvedValue({ ok: true, value: undefined })
  mocks.publish.mockResolvedValue({ ok: true, value: post.id })
  mocks.resolveReport.mockResolvedValue({ ok: true, value: undefined })
  mocks.saveDraft.mockResolvedValue({ ok: true, value: undefined })
})

afterEach(async () => {
  if (root) {
    await act(async () => root?.unmount())
    root = undefined
  }
  document.body.replaceChildren()
})

async function renderClient(element: ReturnType<typeof createElement>): Promise<HTMLElement> {
  const container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(element)
  })
  return container
}

async function rerenderClient(element: ReturnType<typeof createElement>): Promise<void> {
  if (!root) throw new Error("A client root must exist before rerendering.")
  await act(async () => {
    root?.render(element)
  })
}

function buttonByText(container: HTMLElement, label: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll<HTMLButtonElement>("button")].find(
    (button) => button.textContent === label,
  )
}

async function dispatchTwice(target: Element): Promise<void> {
  await act(async () => {
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe("Community client action locks", () => {
  it("replaces a feed projection when related author or product data changes", async () => {
    const original = {
      ...post,
      author: "Original author",
      product: {
        id: "product-1",
        name: "Original product",
        description: "Visible product context.",
      },
    }
    const initial = {
      feed: { posts: [original], nextCursor: undefined },
      viewer: { id: "member", role: "member" as const, canParticipate: true },
    }
    const container = await renderClient(
      createElement(CommunityFeedClient, { initial, query: feedQuery }),
    )
    expect(container.textContent).toContain("Original author")
    expect(container.textContent).toContain("Original product")

    await rerenderClient(
      createElement(CommunityFeedClient, {
        initial: {
          ...initial,
          feed: {
            posts: [{ ...original, author: "Renamed author", product: undefined }],
            nextCursor: undefined,
          },
        },
        query: feedQuery,
      }),
    )

    expect(container.textContent).toContain("Renamed author")
    expect(container.textContent).not.toContain("Original author")
    expect(container.textContent).not.toContain("Original product")
  })

  it("publishes one post and navigates by its compact ID without an extra refresh", async () => {
    const container = await renderClient(
      createElement(CommunityComposerClient, {
        initialDraft: draft,
        products: [],
        viewer: { id: "member", role: "member", canParticipate: true },
      }),
    )
    const form = container.querySelector<HTMLFormElement>("form.c-composer")
    expect(form).not.toBeNull()

    await act(async () => {
      form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
      form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mocks.publish).toHaveBeenCalledOnce()
    expect(mocks.replace).toHaveBeenCalledWith(`/community/t/${post.id}`)
    expect(mocks.refresh).not.toHaveBeenCalled()
  })

  it("saves an edit by navigating to the canonical post without an extra refresh", async () => {
    const container = await renderClient(
      createElement(CommunityComposerClient, {
        initialDraft: null,
        products: [],
        viewer: { id: post.authorId, role: "member", canParticipate: true },
        post,
      }),
    )
    const form = container.querySelector<HTMLFormElement>("form.c-composer")
    expect(form).not.toBeNull()

    await act(async () => {
      form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mocks.editPost).toHaveBeenCalledWith(
      post.id,
      {
        title: post.title,
        body: post.body,
        type: post.type,
        productId: "",
      },
      post.version,
    )
    expect(mocks.replace).toHaveBeenCalledWith(`/community/t/${post.id}`)
    expect(mocks.refresh).not.toHaveBeenCalled()
  })

  it("loads one cursor page for two immediate load-more clicks", async () => {
    const container = await renderClient(
      createElement(CommunityFeedClient, {
        initial: {
          feed: { posts: [post], nextCursor: "2026-09-15T00:00:00.000Z|post-cursor" },
          viewer: { id: "member", role: "member", canParticipate: true },
        },
        query: feedQuery,
      }),
    )
    const loadMore = buttonByText(container, "Load more")
    expect(loadMore).toBeDefined()

    await dispatchTwice(loadMore!)

    expect(mocks.loadPosts).toHaveBeenCalledOnce()
  })

  it("replaces a moderation queue projection when server reports change", async () => {
    const container = await renderClient(
      createElement(CommunityModerationClient, { initialReports: [report] }),
    )
    expect(container.textContent).toContain(report.reason)

    await rerenderClient(createElement(CommunityModerationClient, { initialReports: [] }))

    expect(container.textContent).toContain("No reports to review")
    expect(container.textContent).not.toContain(report.reason)
  })

  it("sends one moderation command for two immediate action clicks", async () => {
    const container = await renderClient(
      createElement(CommunityModerationClient, { initialReports: [report] }),
    )
    const hide = buttonByText(container, "Hide")
    expect(hide).toBeDefined()

    await dispatchTwice(hide!)

    expect(mocks.moderatePost).toHaveBeenCalledOnce()
  })
})
