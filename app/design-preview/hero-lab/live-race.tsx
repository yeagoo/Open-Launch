import Image from "next/image"

import { Link } from "@/i18n/navigation"

import { PillButton } from "@/components/ds/pill-button"
import { RankBadge } from "@/components/ds/rank-badge"
import { SerifHeading } from "@/components/ds/serif-heading"
import { StatPill } from "@/components/ds/stat-pill"
import { TagPill } from "@/components/ds/tag-pill"

import type { HeroConceptProps } from "./shared"

/**
 * Concept 01 — Live Race.
 *
 * The hero doubles as today's scoreboard: copy on the left, a live top-3 board
 * on the right with relative vote bars and the countdown stitched into its
 * footer. The claim ("you get visibility") is proven by the evidence sitting
 * next to it rather than asserted in a subtitle.
 */
export function LiveRaceHero({
  labels,
  projects,
  countdownInitial,
  primaryHref,
  secondaryHref,
  headingLevel = "h1",
}: HeroConceptProps) {
  const board = projects.slice(0, 4)
  const maxVotes = Math.max(1, ...board.map((project) => project.upvoteCount))
  const Heading = headingLevel

  return (
    <section className="border-home-hairline rounded-home-card relative overflow-hidden border">
      <div
        aria-hidden="true"
        className="home-grid-bg home-grid-fade pointer-events-none absolute inset-0"
      />
      <div className="relative grid gap-8 p-6 sm:p-8 lg:grid-cols-12 lg:gap-10 lg:p-10">
        <div className="flex flex-col justify-center lg:col-span-6">
          <p className="text-home-accent-strong mb-4 flex items-center gap-2 font-mono text-[11px] font-semibold tracking-[0.14em] uppercase">
            <span className="relative flex size-1.5">
              <span className="bg-home-accent absolute inline-flex size-full animate-ping rounded-full opacity-75" />
              <span className="bg-home-accent relative inline-flex size-1.5 rounded-full" />
            </span>
            Live · {board.length > 0 ? board[0].name : "—"}
          </p>

          <SerifHeading as={Heading} size="display" className="text-[2rem] sm:text-[2.75rem]">
            {labels.title}
          </SerifHeading>

          <p className="text-muted-foreground mt-4 max-w-md text-sm sm:text-base">
            {labels.subtitle}
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <PillButton asChild size="lg">
              <Link href={primaryHref}>{labels.primaryCta}</Link>
            </PillButton>
            <PillButton asChild size="lg" variant="ghost">
              <Link href={secondaryHref}>{labels.secondaryCta} →</Link>
            </PillButton>
          </div>
        </div>

        <div className="lg:col-span-6">
          <div className="bg-home-surface border-home-hairline shadow-home-card rounded-home-card overflow-hidden border">
            <div className="border-home-hairline flex items-center justify-between border-b px-4 py-3">
              {/* ASCII apostrophe on purpose: the typographic &rsquo; falls
                  back to a different font in the sans stack and renders with a
                  visible gap ("Today’ s race"). */}
              <span className="text-[13px] font-semibold">Today&apos;s race</span>
              <TagPill tone="accent">{labels.countdownLabel}</TagPill>
            </div>

            <ol className="divide-home-hairline divide-y">
              {board.map((project, index) => (
                <li key={project.id} className="relative px-4 py-3">
                  {/* Vote bar: width is relative to the leader, so the gap
                      between #1 and #4 is legible at a glance. */}
                  <span
                    aria-hidden="true"
                    className="bg-home-accent/8 absolute inset-y-1 left-1 rounded-md"
                    style={{ width: `${Math.round((project.upvoteCount / maxVotes) * 88)}%` }}
                  />
                  <div className="relative flex items-center gap-3">
                    <RankBadge rank={index + 1} size="sm" />
                    <span className="bg-home-surface-muted border-home-hairline relative size-8 flex-shrink-0 overflow-hidden rounded-md border">
                      {project.logoUrl && (
                        <Image
                          src={project.logoUrl}
                          alt=""
                          fill
                          quality={95}
                          sizes="32px"
                          className="object-contain"
                        />
                      )}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                      {project.name}
                    </span>
                    <span className="font-mono text-[13px] font-semibold tabular-nums">
                      {project.upvoteCount}
                    </span>
                  </div>
                </li>
              ))}
            </ol>

            <div className="border-home-hairline bg-home-surface-muted/60 flex items-center justify-between gap-3 border-t px-4 py-3">
              <span className="text-muted-foreground font-mono text-xs tabular-nums">
                {String(countdownInitial.hours).padStart(2, "0")}:
                {String(countdownInitial.minutes).padStart(2, "0")}:
                {String(countdownInitial.seconds).padStart(2, "0")}
              </span>
              <StatPill value="128" label="launched today" tone="accent" />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
