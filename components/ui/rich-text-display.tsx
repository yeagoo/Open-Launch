import { cn } from "@/lib/utils"

/**
 * Server-renderable display of HTML produced by `RichTextEditor`.
 *
 * No `"use client"` here so importing this component does NOT
 * drag Tiptap (`@tiptap/react` + extensions) into the page bundle
 * — which it would if you imported it from `rich-text-editor.tsx`,
 * since that file is marked `"use client"` and re-exports across
 * the boundary force-bundle every direct dependency.
 *
 * The project detail page (`/projects/[slug]`) is the canonical
 * caller. Before splitting, it was shipping the entire Tiptap
 * runtime to render a static HTML string.
 */
export const RICH_TEXT_DISPLAY_STYLES =
  "prose prose-sm prose-zinc dark:prose-invert max-w-none w-full whitespace-pre-wrap [&_h1]:my-2 [&_h2]:my-1 [&_p]:my-2 [&_ul]:my-0.5 [&_ol]:my-0.5 [&_li]:my-0.5"

interface RichTextDisplayProps {
  content: string
  className?: string
}

export function RichTextDisplay({ content, className }: RichTextDisplayProps) {
  return (
    <div
      className={cn(RICH_TEXT_DISPLAY_STYLES, className)}
      dangerouslySetInnerHTML={{ __html: content }}
    />
  )
}
