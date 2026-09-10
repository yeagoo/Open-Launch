"use client"

import React, { useEffect, useOptimistic, useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { RiThumbUpFill, RiThumbUpLine } from "@remixicon/react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import { UPVOTE_LIMITS } from "@/lib/constants"
import { cn } from "@/lib/utils"
import { toggleUpvote } from "@/app/actions/projects"

interface UpvoteButtonProps {
  projectId: string
  initialUpvoted: boolean
  upvoteCount: number
  isAuthenticated: boolean
  variant?: "default" | "compact"
  className?: string
}

export function UpvoteButton({
  projectId,
  initialUpvoted,
  upvoteCount,
  isAuthenticated,
  variant = "default",
  className,
}: UpvoteButtonProps) {
  const router = useRouter()
  const t = useTranslations("upvote")
  const [isPending, startTransition] = useTransition()
  const [isDebouncing, setIsDebouncing] = useState(false)
  const [optimisticState, updateOptimisticState] = useOptimistic(
    { upvoted: initialUpvoted, count: upvoteCount },
    (state, newUpvoted: boolean) => ({
      upvoted: newUpvoted,
      count: state.count + (newUpvoted ? 1 : -1),
    }),
  )

  // Réinitialiser l'état de debounce après le temps défini dans les constantes
  useEffect(() => {
    if (isDebouncing) {
      const timer = setTimeout(() => {
        setIsDebouncing(false)
      }, UPVOTE_LIMITS.DEBOUNCE_TIME_MS)
      return () => clearTimeout(timer)
    }
  }, [isDebouncing])

  const handleUpvote = async (e: React.MouseEvent) => {
    e.stopPropagation()

    if (!isAuthenticated) {
      router.push("/sign-in")
      return
    }

    // Si déjà en cours de traitement ou en debounce, ignorer le clic
    if (isPending || isDebouncing) {
      return
    }

    // Activer le debounce
    setIsDebouncing(true)

    startTransition(async () => {
      updateOptimisticState(!optimisticState.upvoted)

      const response = await toggleUpvote(projectId)

      if (!response.success) {
        // Annuler la mise à jour optimiste en cas d'erreur
        updateOptimisticState(optimisticState.upvoted)
        toast.error(response.message)
      }
    })
  }

  if (variant === "compact") {
    return (
      <button
        onClick={handleUpvote}
        disabled={isPending}
        type="button"
        aria-pressed={optimisticState.upvoted}
        aria-label={
          optimisticState.upvoted
            ? t("removeLabel", { count: optimisticState.count })
            : t("label", { count: optimisticState.count })
        }
        // h-11 (44px) keeps the touch target at the platform minimum while
        // dropping the border to a hairline: at h-12/border-2 these controls
        // were visually louder than the row they belong to. Colours come from
        // tokens now — they were hardcoded gray-700/gray-300.
        className={cn(
          "hover:border-primary flex h-11 w-11 cursor-pointer flex-col items-center justify-center rounded-lg border transition-all duration-200",
          optimisticState.upvoted && "border-primary",
          className,
        )}
      >
        {optimisticState.upvoted ? (
          <RiThumbUpFill className="text-primary h-3.5 w-3.5" />
        ) : (
          <RiThumbUpLine className="text-muted-foreground h-3.5 w-3.5" />
        )}
        <span
          className={cn(
            "mt-1 text-[13px] leading-none font-semibold",
            optimisticState.upvoted ? "text-primary" : "text-muted-foreground",
          )}
        >
          {optimisticState.count}
        </span>
      </button>
    )
  }

  return (
    <button
      onClick={handleUpvote}
      disabled={isPending}
      type="button"
      aria-pressed={optimisticState.upvoted}
      aria-label={
        optimisticState.upvoted
          ? t("removeLabel", { count: optimisticState.count })
          : t("label", { count: optimisticState.count })
      }
      className={cn(
        "inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border px-3 transition-colors",
        // Was a fully blue control (border-blue-500/bg-blue-500 when upvoted,
        // blue hovers otherwise) — a fourth accent colour in an app whose
        // actions are the primary token. Now it uses the action colour and
        // theme grays.
        optimisticState.upvoted
          ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
          : "border-border bg-muted text-muted-foreground hover:border-primary hover:text-primary",
        // No opacity dimming: the control is still clickable for a signed-out
        // visitor (it prompts login), so it is not an "inactive component"
        // exempt from contrast — at opacity-75 the count measured 2.89:1.
        !isAuthenticated && "cursor-not-allowed",
        className,
      )}
    >
      {optimisticState.upvoted ? (
        <RiThumbUpFill className="h-4 w-4" />
      ) : (
        <RiThumbUpLine className="h-4 w-4" />
      )}
      <span className="text-sm">{t("count", { count: optimisticState.count })}</span>
    </button>
  )
}
