"use client"

import dynamic from "next/dynamic"

/**
 * Client-side wrapper that lazily imports the comments thread.
 *
 * `TranslatedComments` is ~591 lines and pulls in
 * `@fuma-comment/react/atom` plus a Tiptap content renderer —
 * meaningful weight for a feature most detail-page visitors
 * never scroll to. SEO-wise it's already client-fetched
 * (`useEffect` + `fetch`), so deferring the *bundle* doesn't lose
 * anything indexable.
 *
 * `ssr: false` is required so the heavy chunk isn't part of the
 * page's initial JS payload — Next.js bans `ssr: false` in
 * Server Components, hence this thin client wrapper.
 */
const TranslatedComments = dynamic(
  () => import("./translated-comments").then((m) => ({ default: m.TranslatedComments })),
  {
    ssr: false,
    // Reserve ~240px so the swap from "Loading…" to the real
    // comments thread doesn't yank the page down by several
    // hundred pixels (CLS). A single short comment renders at
    // ~100px; logged-out users see a "sign in to comment" pitch
    // that's a bit taller; 240px covers the common case without
    // looking awkwardly empty.
    loading: () => (
      <div className="flex min-h-[240px] items-center justify-center">
        <p className="text-muted-foreground text-sm">Loading comments…</p>
      </div>
    ),
  },
)

interface CommentsLazyProps {
  projectId: string
  placeholder: string
  currentUserId: string | null
}

export function CommentsLazy(props: CommentsLazyProps) {
  return <TranslatedComments {...props} />
}
