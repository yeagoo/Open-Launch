import * as React from "react"

import { cn } from "@/lib/utils"

interface StatPillProps extends React.ComponentProps<"span"> {
  /** Leading glyph — an icon or the reference layout's small ▲. */
  icon?: React.ReactNode
  value: React.ReactNode
  /** Optional unit/caption rendered after the value in muted text. */
  label?: React.ReactNode
  tone?: "neutral" | "accent" | "highlight"
}

/**
 * Compact "number + caption" stat used by the home rails (visits counter,
 * launch totals) and by each feed row's upvote score. `accent` and `highlight`
 * map to the two palette families, so a mixed palette can color the upvote
 * arrow differently from the CTA.
 */
function StatPill({ icon, value, label, tone = "neutral", className, ...props }: StatPillProps) {
  return (
    <span
      data-slot="stat-pill"
      className={cn(
        "inline-flex items-center gap-1.5 text-xs",
        tone === "accent"
          ? "text-home-accent-strong"
          : tone === "highlight"
            ? "text-home-highlight-strong"
            : "text-muted-foreground",
        className,
      )}
      {...props}
    >
      {icon && <span className="flex-shrink-0 [&_svg]:size-3.5">{icon}</span>}
      <span className="text-foreground font-mono font-semibold tabular-nums">{value}</span>
      {label && <span className="truncate">{label}</span>}
    </span>
  )
}

export { StatPill }
