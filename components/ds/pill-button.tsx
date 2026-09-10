import * as React from "react"

import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Pill-shaped button for the redesigned home page.
 *
 * Separate from `components/ui/button.tsx` on purpose: the home layout uses
 * fully-rounded pills and a warm accent that must not leak into the rest of
 * the app (where `--primary` stays green and corners stay at `--radius`).
 *
 * `accent` is the filled orange CTA, `ink` is the black pill from the
 * reference layout (it inverts to a light pill in dark mode — see the
 * `--home-ink` token), `soft`/`outline` are the low-emphasis chips.
 */
const pillButtonVariants = cva(
  "inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-home-pill font-semibold transition-[background-color,color,border-color,box-shadow,transform] outline-none focus-visible:ring-[3px] focus-visible:ring-home-accent/40 disabled:pointer-events-none disabled:opacity-50 active:translate-y-px [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        accent: "bg-home-accent text-home-accent-foreground hover:bg-home-accent-hover",
        ink: "bg-home-ink text-home-ink-foreground hover:bg-home-ink/90",
        outline:
          "border-home-hairline-strong bg-home-surface text-foreground hover:bg-home-surface-muted border",
        soft: "bg-home-accent-soft text-home-accent-strong border-home-accent-soft-border hover:bg-home-accent-soft/70 border",
        ghost: "text-muted-foreground hover:bg-home-surface-muted hover:text-foreground",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-9 px-4 text-sm",
        lg: "h-11 px-6 text-[15px]",
      },
      full: {
        true: "w-full",
        false: "",
      },
    },
    defaultVariants: {
      variant: "accent",
      size: "md",
      full: false,
    },
  },
)

function PillButton({
  className,
  variant,
  size,
  full,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof pillButtonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="pill-button"
      className={cn(pillButtonVariants({ variant, size, full, className }))}
      {...props}
    />
  )
}

export { PillButton, pillButtonVariants }
