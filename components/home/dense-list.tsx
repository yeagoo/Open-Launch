import Image from "next/image"

import { Link } from "@/i18n/navigation"
import { RiThumbUpLine } from "@remixicon/react"

import { oneLineSummary } from "@/lib/text-summary"

interface DenseProject {
  id: string
  slug: string
  name: string
  tagline?: string | null
  description: string | null
  logoUrl: string
  upvoteCount: number
}

interface DenseListProps {
  projects: DenseProject[]
  // Section heading rendered above the rows. When omitted, the entire
  // heading bar is skipped — useful when the dense list is the
  // continuation of an EditorialHero in the same logical section.
  heading?: string
  // Optional small label rendered above the heading.
  kicker?: string
  // Optional "more" link rendered on the right of the heading.
  moreHref?: string
  moreLabel?: string
  // Starting rank number for the row counter. Defaults to 1. Pass 4
  // when the list continues after a 3-card EditorialHero so the
  // numbering picks up at 04 instead of restarting at 01.
  startRank?: number
}

/**
 * Dense one-row-per-project list for the editorial home page.
 *
 * Used for the long tail after the EditorialHero. Each row is a single
 * line on desktop: rank + small logo + title + 1-liner summary +
 * upvote count, all left-aligned. Trades visual weight for scannable
 * density — feels more like a curated reading list than a card grid.
 */
export function DenseList({
  projects,
  heading,
  kicker,
  moreHref,
  moreLabel,
  startRank = 1,
}: DenseListProps) {
  if (projects.length === 0) return null

  // Skip the entire heading bar when no heading is supplied — common
  // when the list continues after an EditorialHero in the same section.
  const showHeading = !!heading

  return (
    <section className="space-y-4">
      {showHeading && (
        <div className="border-border/40 flex items-end justify-between border-b pb-3">
          <div>
            {kicker && (
              <p className="text-muted-foreground mb-1 font-mono text-xs tracking-wider uppercase">
                {kicker}
              </p>
            )}
            <h2 className="font-editorial text-xl font-semibold tracking-tight sm:text-2xl">
              {heading}
            </h2>
          </div>
          {moreHref && moreLabel && (
            <Link
              href={moreHref}
              className="text-muted-foreground hover:text-foreground text-xs underline-offset-4 hover:underline"
            >
              {moreLabel} →
            </Link>
          )}
        </div>
      )}

      <ul className="divide-border/40 divide-y">
        {projects.map((p, idx) => (
          <li key={p.id}>
            <Link
              href={`/projects/${p.slug}`}
              className="group hover:bg-muted/30 -mx-2 flex items-center gap-4 rounded-md px-2 py-3 transition-colors"
            >
              <span className="text-muted-foreground/50 hidden w-7 text-right font-mono text-xs tabular-nums sm:inline-block">
                {String(startRank + idx).padStart(2, "0")}
              </span>
              <div className="bg-muted relative h-9 w-9 flex-shrink-0 overflow-hidden rounded-sm">
                {p.logoUrl && (
                  <Image
                    src={p.logoUrl}
                    alt={`${p.name} logo`}
                    fill
                    quality={95}
                    className="object-contain"
                    sizes="36px"
                  />
                )}
              </div>
              <div className="flex min-w-0 flex-1 items-baseline gap-3">
                <span className="text-foreground group-hover:text-primary truncate font-medium transition-colors">
                  {p.name}
                </span>
                <span className="text-muted-foreground hidden truncate text-sm sm:inline">
                  {p.tagline?.trim() || oneLineSummary(p.description, 90)}
                </span>
              </div>
              <span className="text-muted-foreground flex flex-shrink-0 items-center gap-1 text-xs">
                <RiThumbUpLine className="h-3.5 w-3.5" />
                {p.upvoteCount}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
