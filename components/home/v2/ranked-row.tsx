import Image from "next/image"

import { Link } from "@/i18n/navigation"
import { RiThumbUpLine } from "@remixicon/react"

import { oneLineSummary } from "@/lib/text-summary"
import { RankBadge } from "@/components/ds/rank-badge"
import { TagPill } from "@/components/ds/tag-pill"

export interface HomeFeedProject {
  id: string
  slug: string
  name: string
  tagline?: string | null
  description: string | null
  logoUrl: string | null
  upvoteCount: number
  commentCount?: number | null
  categories?: { id: string; name: string }[]
}

interface RankedRowProps {
  project: HomeFeedProject
  rank: number
  /** Already-translated "{count} reviews" label; omitted when there are none. */
  renderCommentLabel?: (count: number) => string
  /** Already-translated "Rank {rank}" label for the rank marker. */
  renderRankLabel?: (rank: number) => string
  /**
   * Interactive controls rendered instead of the static vote count.
   *
   * Passed as a slot rather than built in, so this stays a SERVER component:
   * reading surfaces (the home feed) pay no client JS, while voting surfaces
   * (trending, categories) pass the existing client `ProjectCardButtons`
   * through. Both get the same row.
   */
  actions?: React.ReactNode
}

/**
 * Loading placeholder for `RankedRow`, kept in the same file on purpose.
 *
 * The skeletons it replaces described the deleted `ProjectCard` — a bordered
 * card with a 48/56px logo — long after the real row had become a borderless
 * `<li>` with a 40px logo, so the list visibly reflowed when data arrived.
 * Living next to the row is what keeps the two from drifting apart again.
 */
export function RankedRowSkeleton({ withActions = true }: { withActions?: boolean } = {}) {
  return (
    <li className="flex animate-pulse items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3 px-2 py-3 sm:gap-4 sm:px-3">
        <span className="bg-home-surface-muted border-home-hairline rounded-home-pill h-6 min-w-6 border" />
        <span className="bg-home-surface-muted border-home-hairline size-10 flex-shrink-0 rounded-[10px] border" />
        <div className="min-w-0 flex-1">
          <div className="bg-muted h-4 w-1/3 rounded" />
          <div className="bg-muted mt-1.5 h-3 w-2/3 rounded" />
          <div className="bg-muted rounded-home-pill mt-1.5 h-5 w-24 rounded" />
        </div>
      </div>
      {withActions && (
        <div className="flex flex-shrink-0 items-center gap-2 pr-2 sm:pr-3">
          <span className="bg-muted h-11 w-11 rounded-lg border border-dashed" />
          <span className="bg-muted hidden h-11 w-11 rounded-lg border border-dashed sm:block" />
        </div>
      )}
    </li>
  )
}

/**
 * One row of the home feed: rank, logo, name, one-liner, category chips and the
 * upvote score. Mirrors the reference layout's list item, including the mobile
 * reflow — the review chip is the first thing to go on narrow screens, because
 * keeping it on the title line squeezes the product name into a truncated stub.
 */
export function RankedRow({
  project,
  rank,
  renderCommentLabel,
  renderRankLabel,
  actions,
}: RankedRowProps) {
  const summary = project.tagline?.trim() || oneLineSummary(project.description, 110)
  const categories = (project.categories ?? []).slice(0, 2)
  const commentCount = project.commentCount ?? 0
  const commentLabel =
    commentCount > 0 && renderCommentLabel ? renderCommentLabel(commentCount) : null

  return (
    // The row link and the `actions` slot must be SIBLINGS, not nested: the
    // actions contain their own link and a button, and an <a> inside an <a> is
    // invalid HTML (the parser hoists the inner one out, which desyncs
    // hydration and breaks click handling). The link therefore covers only the
    // content area, and hover styling lives on the <li> so the whole row still
    // highlights as one unit.
    <li className="group hover:bg-home-surface-muted/70 rounded-home-card flex items-center transition-colors">
      <Link
        href={`/projects/${project.slug}`}
        className="flex min-w-0 flex-1 items-center gap-3 px-2 py-3 sm:gap-4 sm:px-3"
      >
        <RankBadge rank={rank} label={renderRankLabel?.(rank)} />

        <div className="bg-home-surface-muted border-home-hairline relative size-10 flex-shrink-0 overflow-hidden rounded-[10px] border">
          {project.logoUrl && (
            <Image
              src={project.logoUrl}
              alt=""
              fill
              // 95 is the quality the rest of the project's logo/cover renders
              // use, and one of the two values listed in next.config `images.
              // qualities` — anything else logs an unconfigured-quality warning.
              quality={95}
              sizes="40px"
              className="object-contain"
            />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[15px] font-semibold">{project.name}</span>
            {commentLabel && (
              <TagPill tone="highlight" className="hidden sm:inline-flex">
                {commentLabel}
              </TagPill>
            )}
          </div>
          {summary && (
            <p className="text-muted-foreground mt-0.5 line-clamp-1 text-[13px]">{summary}</p>
          )}
          {(categories.length > 0 || commentLabel) && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {categories.map((category) => (
                <TagPill key={category.id}>{category.name}</TagPill>
              ))}
              {commentLabel && (
                <TagPill tone="highlight" className="sm:hidden">
                  {commentLabel}
                </TagPill>
              )}
            </div>
          )}
        </div>

        {/* Display-only rows keep the score inside the link; interactive rows
            render it in the actions slot outside the link. */}
        {!actions && (
          <span className="text-muted-foreground flex flex-shrink-0 flex-col items-center px-1">
            <RiThumbUpLine className="text-home-highlight-strong h-3.5 w-3.5" aria-hidden="true" />
            <span className="text-foreground font-mono text-sm font-semibold tabular-nums">
              {project.upvoteCount}
            </span>
          </span>
        )}
      </Link>
      {actions && <div className="flex flex-shrink-0 items-center pr-2 sm:pr-3">{actions}</div>}
    </li>
  )
}
