import Image from "next/image"

import { Link } from "@/i18n/navigation"
import { RiArrowRightLine } from "@remixicon/react"

import { SerifHeading } from "@/components/ds/serif-heading"
import { TagPill } from "@/components/ds/tag-pill"

import type { HeroConceptProps } from "./shared"

/**
 * Concept 05 — Masthead.
 *
 * A front page instead of a landing banner: issue line, printers' rules, a lead
 * story with the day's #1 launch as its artwork, and the rest of the day's
 * launches as a three-column digest underneath. No pill buttons anywhere — the
 * CTAs are editorial links and one square rule-bordered button — which is what
 * makes it feel like a publication rather than a product page.
 */
export function MastheadHero({
  labels,
  projects,
  primaryHref,
  secondaryHref,
  headingLevel = "h1",
}: HeroConceptProps) {
  const Heading = headingLevel
  const [lead, ...rest] = projects
  const digest = rest.slice(0, 3)

  return (
    <section className="bg-home-surface border-home-hairline rounded-home-card border px-5 py-6 sm:px-8 sm:py-8">
      <div className="text-muted-foreground flex flex-wrap items-baseline justify-between gap-2 font-mono text-[10px] tracking-[0.16em] uppercase">
        <span className="text-foreground font-semibold">aat.ee — The Daily Launch</span>
        <span>Vol. 2026 · No. 253 · Thursday, Sep 10</span>
        <span>Free to submit</span>
      </div>

      <div className="border-home-hairline-strong mt-3 border-t-2" />
      <div className="border-home-hairline mt-0.5 border-t" />

      <div className="grid gap-8 py-7 lg:grid-cols-12 lg:gap-10">
        <div className="lg:col-span-7">
          <SerifHeading
            as={Heading}
            size="display"
            className="text-[2rem] leading-[1.05] sm:text-[2.75rem]"
          >
            {labels.title}
          </SerifHeading>
          <p className="text-muted-foreground mt-4 max-w-xl text-sm sm:text-base">
            {labels.subtitle}
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
            <Link
              href={primaryHref}
              className="border-foreground text-foreground hover:bg-foreground hover:text-background inline-flex items-center border px-4 py-2 text-sm font-semibold transition-colors"
            >
              {labels.primaryCta}
            </Link>
            <Link
              href={secondaryHref}
              className="text-foreground decoration-foreground/30 inline-flex items-center gap-1 text-sm font-medium underline decoration-2 underline-offset-4 transition-colors hover:decoration-current"
            >
              {labels.secondaryCta}
              <RiArrowRightLine className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </div>

        {lead && (
          <div className="lg:col-span-5">
            <div className="border-home-hairline flex h-full gap-4 border-l-2 pl-5">
              <span className="bg-home-surface-muted border-home-hairline relative size-16 flex-shrink-0 overflow-hidden rounded-sm border">
                {lead.logoUrl && (
                  <Image
                    src={lead.logoUrl}
                    alt=""
                    fill
                    quality={95}
                    sizes="64px"
                    className="object-contain"
                  />
                )}
              </span>
              <div className="min-w-0">
                <p className="text-muted-foreground font-mono text-[10px] tracking-[0.16em] uppercase">
                  Lead launch
                </p>
                <p className="font-editorial mt-1 text-lg leading-tight font-semibold">
                  {lead.name}
                </p>
                <p className="text-muted-foreground mt-1 line-clamp-2 text-[13px]">
                  {lead.tagline?.trim() || lead.description}
                </p>
                <p className="mt-2 font-mono text-xs font-semibold tabular-nums">
                  {lead.upvoteCount} upvotes
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {digest.length > 0 && (
        <>
          <div className="border-home-hairline border-t" />
          <div className="grid gap-6 py-5 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-[var(--home-hairline)]">
            {digest.map((project, index) => (
              <div key={project.id} className="sm:px-5 sm:first:pl-0 sm:last:pr-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-home-accent-strong font-mono text-[11px] font-bold">
                    {String(index + 2).padStart(2, "0")}
                  </span>
                  <p className="truncate text-[13px] font-semibold">{project.name}</p>
                </div>
                <p className="text-muted-foreground mt-1 line-clamp-2 text-[12px] leading-snug">
                  {project.tagline?.trim() || project.description}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  {project.categories?.[0] && <TagPill>{project.categories[0].name}</TagPill>}
                  <span className="text-muted-foreground font-mono text-[11px] tabular-nums">
                    {project.upvoteCount}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="border-home-hairline border-t" />
          <div className="border-home-hairline-strong mt-0.5 border-t-2" />
        </>
      )}
    </section>
  )
}
