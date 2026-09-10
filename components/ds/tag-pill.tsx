import * as React from "react"

import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const tagPillVariants = cva(
  "inline-flex w-fit flex-shrink-0 items-center gap-1 rounded-home-pill border px-2 py-0.5 text-[11px] leading-4 font-medium whitespace-nowrap transition-colors",
  {
    variants: {
      tone: {
        // Default hairline chip used for category/tag labels.
        neutral: "border-home-hairline text-muted-foreground",
        // Action-colored chip — follows the palette's primary accent.
        accent: "border-home-accent-soft-border bg-home-accent-soft text-home-accent-strong",
        // Secondary warm chip (review counts, "new", …). In the mixed palettes
        // this is the *other* hue, which is what keeps green and orange from
        // reading as one flat color.
        highlight:
          "border-home-highlight-soft-border bg-home-highlight-soft text-home-highlight-strong",
        ink: "border-transparent bg-home-ink text-home-ink-foreground",
      },
      interactive: {
        true: "cursor-pointer hover:border-home-hairline-strong hover:text-foreground",
        false: "",
      },
    },
    defaultVariants: {
      tone: "neutral",
      interactive: false,
    },
  },
)

interface TagPillProps extends React.ComponentProps<"span">, VariantProps<typeof tagPillVariants> {
  /** Render as the child element (e.g. a localized `<Link>`) instead of a span. */
  asChild?: boolean
}

/**
 * Small outline chip used for categories, tags and inline counts on the home
 * feed. `interactive` only changes the hover affordance — pass `asChild` with
 * a link when the chip is actually navigable.
 */
function TagPill({ className, tone, interactive, asChild = false, ...props }: TagPillProps) {
  const Comp = asChild ? Slot : "span"

  return (
    <Comp
      data-slot="tag-pill"
      className={cn(tagPillVariants({ tone, interactive, className }))}
      {...props}
    />
  )
}

export { TagPill, tagPillVariants }
