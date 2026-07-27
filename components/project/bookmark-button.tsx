"use client"

import React, { useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { RiBookmarkFill, RiBookmarkLine } from "@remixicon/react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { toggleBookmark } from "@/app/actions/bookmarks"

interface BookmarkButtonProps {
  projectId: string
  initialBookmarked: boolean
  isAuthenticated: boolean
  className?: string
}

/**
 * Save/unsave a project. Local state (not useOptimistic): the page is not
 * revalidated after the action, so an optimistic value would snap back to
 * the stale prop once the action settles. We flip eagerly, then settle on
 * the server's authoritative result (reverting on failure).
 */
export function BookmarkButton({
  projectId,
  initialBookmarked,
  isAuthenticated,
  className,
}: BookmarkButtonProps) {
  const router = useRouter()
  const t = useTranslations("bookmark")
  const [isPending, startTransition] = useTransition()
  const [bookmarked, setBookmarked] = useState(initialBookmarked)

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()

    if (!isAuthenticated) {
      router.push("/sign-in")
      return
    }
    if (isPending) return

    const previous = bookmarked
    setBookmarked(!previous)
    startTransition(async () => {
      const result = await toggleBookmark(projectId)
      if (!result.success || result.bookmarked === undefined) {
        setBookmarked(previous)
        toast.error(result.message ?? t("failed"))
        return
      }
      setBookmarked(result.bookmarked)
      toast.success(result.bookmarked ? t("added") : t("removed"))
    })
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      aria-pressed={bookmarked}
      aria-label={bookmarked ? t("removeLabel") : t("addLabel")}
      title={bookmarked ? t("removeLabel") : t("addLabel")}
      className={cn(
        "hover:border-primary flex h-9 w-9 cursor-pointer items-center justify-center rounded-md border transition-colors",
        bookmarked ? "border-primary text-primary" : "text-muted-foreground",
        className,
      )}
    >
      {bookmarked ? <RiBookmarkFill className="h-4 w-4" /> : <RiBookmarkLine className="h-4 w-4" />}
    </button>
  )
}
