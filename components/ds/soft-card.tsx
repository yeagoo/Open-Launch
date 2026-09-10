import * as React from "react"

import { Slot } from "@radix-ui/react-slot"

import { cn } from "@/lib/utils"

interface SoftCardProps extends React.ComponentProps<"div"> {
  /** Render as the child element (e.g. a `<Link>`) instead of a div. */
  asChild?: boolean
  /** Adds the hover border + shadow lift used by clickable cards. */
  interactive?: boolean
  padding?: "none" | "sm" | "md" | "lg"
}

const PADDING_CLASSES = {
  none: "",
  sm: "p-3",
  md: "p-4",
  lg: "p-5 sm:p-6",
} as const

/**
 * The bordered white surface the redesigned home page is built from — feed
 * rows, rail blocks, blog strips, partner cards.
 *
 * Square-ish and hairline-bordered on purpose: the reference layout leans on
 * 1px separators rather than heavy shadows, so `interactive` only lifts the
 * card on hover.
 */
function SoftCard({
  asChild = false,
  interactive = false,
  padding = "md",
  className,
  ...props
}: SoftCardProps) {
  const Comp = asChild ? Slot : "div"

  return (
    <Comp
      data-slot="soft-card"
      className={cn(
        "bg-home-surface border-home-hairline rounded-home-card shadow-home-card border",
        PADDING_CLASSES[padding],
        interactive &&
          "hover:border-home-hairline-strong hover:shadow-home-lift transition-[border-color,box-shadow]",
        className,
      )}
      {...props}
    />
  )
}

export { SoftCard }
