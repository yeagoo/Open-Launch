import * as React from "react"

import { cn } from "@/lib/utils"

interface RankBadgeProps extends React.ComponentProps<"span"> {
  /** 1-based ranking position. 1–3 render as medals, everything else as a
   *  monospace ordinal so long lists stay scannable. */
  rank: number
  size?: "sm" | "md"
  /**
   * Already-translated screen-reader label ("Rank 4"). Without it the badge
   * exposes only its glyph — a medal emoji or a bare number — to assistive
   * tech, so callers that have a translator should always pass one.
   */
  label?: string
}

const MEDALS: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" }

/**
 * Rank marker for the home feed rows. Ranks 1–3 get a medal, the long tail
 * gets a muted monospace number — the same visual hierarchy the reference
 * layout uses to separate "winners" from "the rest of the list".
 */
function RankBadge({ rank, size = "md", label, className, ...props }: RankBadgeProps) {
  const medal = MEDALS[rank]
  const isPodium = Boolean(medal)

  return (
    <span
      data-slot="rank-badge"
      data-rank={rank}
      aria-label={label}
      className={cn(
        "inline-flex flex-shrink-0 items-center justify-center tabular-nums",
        size === "sm" ? "h-5 min-w-5 text-[11px]" : "h-6 min-w-6 text-xs",
        isPodium
          ? "text-[15px] leading-none"
          : "bg-home-surface-muted text-muted-foreground border-home-hairline rounded-home-pill border font-mono font-medium",
        className,
      )}
      {...props}
    >
      {medal ?? rank}
    </span>
  )
}

export { RankBadge }
