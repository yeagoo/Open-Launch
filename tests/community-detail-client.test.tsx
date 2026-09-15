// @vitest-environment jsdom

import { act, createElement, type ReactNode } from "react"

import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import type { CommunityPost, CommunityReply, CommunityViewer } from "@/lib/community/contracts"
import { CommunityDetailClient } from "@/components/community/community-detail-client"

const mocks = vi.hoisted(() => ({
  deletePost: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  reply: vi.fn(),
  loadReplies: vi.fn(),
  toast: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }),
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
  deleteCommunityPost: mocks.deletePost,
  deleteCommunityReply: vi.fn(),
  editCommunityReply: vi.fn(),
  loadMoreCommunityReplies: mocks.loadReplies,
  replyToCommunityPost: mocks.reply,
  reportCommunityPost: vi.fn(),
  reportCommunityReply: vi.fn(),
  setCommunityBookmark: vi.fn(),
  setCommunityVote: vi.fn(),
}))
vi.mock("@/components/ui/safe-markdown", async () => {
  const React = await import("react")
  return {
    SafeMarkdown: ({ children }: { children: ReactNode }) =>
      React.createElement("span", null, children),
  }
})
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
    PostMeta: ({ post }: { post: { author: string } }) =>
      React.createElement("span", { "data-testid": "post-author" }, post.author),
    ProductContextCard: ({ post }: { post: { product?: { name: string } } }) =>
      post.product
        ? React.createElement("span", { "data-testid": "post-product" }, post.product.name)
        : null,
  }
})

const post: CommunityPost = {
  id: "10000000-0000-4000-8000-000000000010",
  authorId: "author",
  author: "Author",
  type: "Shipped",
  title: "A public update",
  body: "A public update with enough context to render the reply form.",
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
const reply: CommunityReply = {
  id: "10000000-0000-4000-8000-000000000011",
  authorId: "member",
  author: "Member",
  body: "A useful reply that should be recorded once.",
  state: "public",
  createdAt: Date.now(),
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
  mocks.deletePost.mockResolvedValue({ ok: true, value: undefined })
  mocks.reply.mockResolvedValue({ ok: true, value: reply })
  mocks.loadReplies.mockResolvedValue({ ok: true, value: { replies: [], nextCursor: undefined } })
})

afterEach(async () => {
  if (root) {
    await act(async () => root?.unmount())
    root = undefined
  }
  document.body.replaceChildren()
})

async function renderDetail(
  initialPost: CommunityPost = post,
  viewer: CommunityViewer = { id: "member", role: "member", canParticipate: true },
): Promise<HTMLElement> {
  const container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(
      createElement(CommunityDetailClient, {
        initialPost,
        viewer,
      }),
    )
  })
  return container
}

async function rerenderDetail(initialPost: CommunityPost, viewer: CommunityViewer): Promise<void> {
  if (!root) throw new Error("A detail root must exist before rerendering.")
  await act(async () => {
    root?.render(
      createElement(CommunityDetailClient, {
        initialPost,
        viewer,
      }),
    )
  })
}

function setTextareaValue(textarea: HTMLTextAreaElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set
  setter?.call(textarea, value)
  textarea.dispatchEvent(new Event("input", { bubbles: true }))
}

describe("CommunityDetailClient reply submission", () => {
  it("replaces a detail projection when related author, reply, or product data changes", async () => {
    const viewer = { id: "member", role: "member", canParticipate: true } as const
    const originalReply = { ...reply, author: "Original responder", version: 1 }
    const original = {
      ...post,
      author: "Original author",
      replies: [originalReply],
      replyCount: 1,
      product: {
        id: "product-1",
        name: "Original product",
        description: "Visible product context.",
      },
    }
    const container = await renderDetail(original, viewer)
    expect(container.textContent).toContain("Original author")
    expect(container.textContent).toContain("Original product")
    expect(container.textContent).toContain("Original responder")

    await rerenderDetail(
      {
        ...original,
        author: "Renamed author",
        replies: [{ ...originalReply, author: "Renamed responder" }],
        product: undefined,
      },
      viewer,
    )

    expect(container.textContent).toContain("Renamed author")
    expect(container.textContent).not.toContain("Original author")
    expect(container.textContent).not.toContain("Original product")
    expect(container.textContent).toContain("Renamed responder")
    expect(container.textContent).not.toContain("Original responder")
  })

  it("keeps deletion available to the author after a post is locked", async () => {
    const container = await renderDetail(
      { ...post, locked: true },
      { id: post.authorId, role: "member", canParticipate: true },
    )

    const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
    expect(buttons.some((button) => button.textContent === "Edit post")).toBe(false)
    expect(buttons.some((button) => button.textContent === "Delete post")).toBe(true)
  })

  it("closes reply and edit controls after a post is locked while retaining reply deletion", async () => {
    const container = await renderDetail(
      { ...post, locked: true, replies: [reply], replyCount: 1 },
      { id: reply.authorId!, role: "member", canParticipate: true },
    )

    const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
    expect(buttons.some((button) => button.textContent === "Reply")).toBe(false)
    expect(buttons.some((button) => button.textContent === "Edit")).toBe(false)
    expect(buttons.some((button) => button.textContent === "Delete")).toBe(true)
    expect(container.textContent).toContain("Replies are closed for this post.")
  })

  it("renders a hidden post body for an authorized moderator review", async () => {
    const hiddenBody = "Moderator-only context retained for a fair review."
    const container = await renderDetail(
      { ...post, state: "hidden", body: hiddenBody },
      { id: "moderator", role: "moderator", canParticipate: true },
    )

    expect(container.textContent).toContain("Post hidden")
    expect(container.textContent).toContain(hiddenBody)
  })

  it("keeps a hidden body redacted for a non-moderator", async () => {
    const hiddenBody = "This body must not be rendered to a regular member."
    const container = await renderDetail(
      { ...post, state: "hidden", body: hiddenBody },
      { id: "member", role: "member", canParticipate: true },
    )

    expect(container.textContent).toContain("Post hidden")
    expect(container.textContent).not.toContain(hiddenBody)
  })

  it("redirects after deletion without refreshing the outgoing thread route", async () => {
    const container = await renderDetail(post, {
      id: post.authorId,
      role: "member",
      canParticipate: true,
    })
    const deleteButton = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
      (button) => button.textContent === "Delete post",
    )
    expect(deleteButton).toBeDefined()

    await act(async () => {
      deleteButton?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
    })
    const dialog = container.querySelector('[role="dialog"]')
    const confirm = Array.from(dialog?.querySelectorAll<HTMLButtonElement>("button") ?? []).find(
      (button) => button.textContent === "Delete post",
    )
    expect(confirm).toBeDefined()

    await act(async () => {
      confirm?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mocks.deletePost).toHaveBeenCalledWith(post.id, post.version)
    expect(mocks.replace).toHaveBeenCalledWith("/community")
    expect(mocks.refresh).not.toHaveBeenCalled()
  })

  it("submits one reply when the form receives two immediate submit events", async () => {
    const container = await renderDetail()
    const textarea = container.querySelector<HTMLTextAreaElement>(
      'textarea[aria-label="Your reply"]',
    )
    const form = container.querySelector<HTMLFormElement>("form.c-reply-form")
    expect(textarea).not.toBeNull()
    expect(form).not.toBeNull()

    await act(async () => {
      setTextareaValue(textarea!, reply.body)
    })
    await act(async () => {
      form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
      form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mocks.reply).toHaveBeenCalledOnce()
    expect(container.textContent).toContain("Replies · 1")
  })

  it("releases the reply guard after a failure while retaining the retry key", async () => {
    mocks.reply
      .mockResolvedValueOnce({
        ok: false,
        error: { code: "retryable", message: "The reply could not be recorded." },
      })
      .mockResolvedValueOnce({ ok: true, value: reply })
    const container = await renderDetail()
    const textarea = container.querySelector<HTMLTextAreaElement>(
      'textarea[aria-label="Your reply"]',
    )
    const form = container.querySelector<HTMLFormElement>("form.c-reply-form")
    expect(textarea).not.toBeNull()
    expect(form).not.toBeNull()

    await act(async () => {
      setTextareaValue(textarea!, reply.body)
      form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(mocks.reply).toHaveBeenCalledOnce()
    expect(container.textContent).toContain("The reply could not be recorded.")

    await act(async () => {
      form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mocks.reply).toHaveBeenCalledTimes(2)
    expect(mocks.reply.mock.calls[1]?.[2]).toBe(mocks.reply.mock.calls[0]?.[2])
    expect(container.textContent).toContain("Replies · 1")
  })

  it("keeps replies in chronological order when a local reply arrives between cursor pages", async () => {
    const earliest: CommunityReply = {
      id: "10000000-0000-4000-8000-000000000012",
      authorId: "author",
      author: "Author",
      body: "Earliest reply from the first cursor page.",
      state: "public",
      createdAt: 100,
    }
    const middle: CommunityReply = {
      id: "10000000-0000-4000-8000-000000000013",
      authorId: "reader",
      author: "Reader",
      body: "Middle reply from the next cursor page.",
      state: "public",
      createdAt: 300,
    }
    const newest: CommunityReply = {
      id: "10000000-0000-4000-8000-000000000014",
      authorId: "member",
      author: "Member",
      body: "Newest reply posted while more replies remained.",
      state: "public",
      createdAt: 300,
    }
    mocks.reply.mockResolvedValue({ ok: true, value: newest })
    mocks.loadReplies.mockResolvedValue({
      ok: true,
      value: { replies: [middle], nextCursor: undefined },
    })
    const container = await renderDetail({
      ...post,
      replies: [earliest],
      replyCount: 2,
      replyCursor: "next-page",
    })
    const textarea = container.querySelector<HTMLTextAreaElement>(
      'textarea[aria-label="Your reply"]',
    )
    const form = container.querySelector<HTMLFormElement>("form.c-reply-form")
    expect(textarea).not.toBeNull()
    expect(form).not.toBeNull()

    await act(async () => {
      setTextareaValue(textarea!, newest.body)
      form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
      await Promise.resolve()
      await Promise.resolve()
    })

    const loadMore = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Load more replies",
    )
    expect(loadMore).toBeDefined()
    await act(async () => {
      loadMore?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await Promise.resolve()
      await Promise.resolve()
    })

    const text = container.textContent ?? ""
    expect(text.indexOf(earliest.body)).toBeLessThan(text.indexOf(middle.body))
    expect(text.indexOf(middle.body)).toBeLessThan(text.indexOf(newest.body))
  })
})
