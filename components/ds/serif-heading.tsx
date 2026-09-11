import * as React from "react"

import { cn } from "@/lib/utils"

type SerifSize = "display" | "section" | "card" | "eyebrow"

interface SerifHeadingProps extends React.ComponentProps<"div"> {
  /** Heading element to render. Defaults to `h2` — never let a card or a
   *  sidebar block render an `h1`; the page owns exactly one. */
  as?: "h1" | "h2" | "h3" | "p" | "div"
  size?: SerifSize
  /** Small all-caps label rendered above the heading. */
  kicker?: React.ReactNode
  /** Optional trailing slot (a "view all" link, a count, …) pinned right. */
  action?: React.ReactNode
}

const SIZE_CLASSES: Record<SerifSize, string> = {
  // The oversized hero line from the reference layout. `font-editorial` is
  // the already-loaded IBM Plex Serif — reusing it keeps the Google font
  // build cache untouched.
  display:
    "font-editorial text-[2rem] leading-[1.08] font-semibold tracking-[-0.02em] sm:text-5xl lg:text-6xl",
  section: "font-editorial text-xl leading-tight font-semibold tracking-tight sm:text-2xl",
  card: "font-editorial text-base leading-snug font-semibold tracking-tight",
  eyebrow:
    "text-muted-foreground text-[11px] leading-none font-semibold tracking-[0.14em] uppercase",
}

/**
 * Typographic scale for the redesigned home page: serif display headings with
 * an optional kicker and a right-aligned action slot. `eyebrow` deliberately
 * drops the serif for the small caps labels used on rail headers.
 */
function SerifHeading({
  as: Comp = "h2",
  size = "section",
  kicker,
  action,
  className,
  children,
  ...props
}: SerifHeadingProps) {
  const heading = (
    <Comp
      // `id`, `aria-*` and anything else a caller passes belong on the heading
      // itself. They used to be spread onto the wrapper — and dropped entirely
      // when there was no kicker or action, so `<SerifHeading id="x">` silently
      // lost the id and nothing could point `aria-labelledby` at the heading.
      {...props}
      data-slot="serif-heading"
      data-size={size}
      className={cn(SIZE_CLASSES[size], size === "eyebrow" ? "" : "text-foreground", className)}
    >
      {children}
    </Comp>
  )

  if (!kicker && !action) return heading

  return (
    <div className="flex items-end justify-between gap-4">
      <div className="min-w-0">
        {kicker && (
          <p className={cn(SIZE_CLASSES.eyebrow, "mb-2")} data-slot="serif-heading-kicker">
            {kicker}
          </p>
        )}
        {heading}
      </div>
      {action && <div className="flex-shrink-0 pb-0.5">{action}</div>}
    </div>
  )
}

export { SerifHeading }
