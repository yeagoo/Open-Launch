"use client"

import { useEffect, useRef, useState } from "react"
import dynamic from "next/dynamic"

import { cn } from "@/lib/utils"

import type { RichTextEditorProps } from "./rich-text-editor"

const RichTextEditor = dynamic(
  () => import("./rich-text-editor").then((module) => module.RichTextEditor),
  {
    ssr: false,
    loading: () => (
      <div
        className="bg-muted/20 min-h-[168px] animate-pulse rounded-md border"
        role="status"
        aria-label="Loading rich text editor"
      />
    ),
  },
)

/**
 * Keep Tiptap out of the initial submit chunk. The editor loads when its
 * field approaches the viewport or the user explicitly activates it.
 */
export function RichTextEditorLazy(props: RichTextEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [activated, setActivated] = useState(() => props.content.length > 0)

  useEffect(() => {
    if (activated || !containerRef.current || typeof IntersectionObserver === "undefined") return
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        setActivated(true)
        observer.disconnect()
      },
      { rootMargin: "200px" },
    )
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [activated])

  return (
    <div ref={containerRef}>
      {activated ? (
        <RichTextEditor {...props} />
      ) : (
        <button
          type="button"
          className={cn(
            "border-input bg-background text-muted-foreground hover:border-ring focus-visible:border-ring focus-visible:ring-ring/50 min-h-[168px] w-full rounded-md border px-3 py-2 text-left text-sm transition-colors focus-visible:ring-[3px] focus-visible:outline-none",
            props.className,
          )}
          onClick={() => setActivated(true)}
          onFocus={() => setActivated(true)}
          data-rich-text-editor="deferred"
        >
          {props.placeholder ?? "Start writing..."}
        </button>
      )}
    </div>
  )
}
