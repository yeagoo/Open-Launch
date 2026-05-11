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
    loading: () => (
      <p className="text-muted-foreground py-6 text-center text-sm">Loading comments…</p>
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
