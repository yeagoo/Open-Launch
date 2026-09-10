import { Link } from "@/i18n/navigation"
import { RiArrowRightLine, RiCheckLine } from "@remixicon/react"

import { PillButton } from "@/components/ds/pill-button"
import { SerifHeading } from "@/components/ds/serif-heading"

import type { HeroConceptProps } from "./shared"

const MAKER_POINTS = [
  "Verified badge for your product page",
  "Do-follow backlink, live within a day",
  "Real feedback from early adopters",
] as const

const BROWSER_POINTS = [
  "Fresh launches every day at 08:00 UTC",
  "Hand-checked, categorised, searchable",
  "Vote for what deserves the top slot",
] as const

/**
 * Concept 03 — Two Doors.
 *
 * The hero's body is a self-segmentation step instead of a pitch: one panel for
 * people who are launching, one for people who are browsing. Each panel carries
 * its own evidence and its own CTA, so neither audience has to translate a
 * generic slogan into their own goal.
 */
export function TwoDoorsHero({
  labels,
  primaryHref,
  secondaryHref,
  headingLevel = "h1",
}: HeroConceptProps) {
  const Heading = headingLevel

  return (
    <section className="border-home-hairline rounded-home-card relative overflow-hidden border">
      <div
        aria-hidden="true"
        className="home-grid-bg home-grid-fade pointer-events-none absolute inset-0"
      />
      <div className="relative px-6 py-10 sm:px-8 sm:py-12 lg:px-12">
        <div className="mx-auto max-w-2xl text-center">
          <SerifHeading as={Heading} size="display" className="text-[1.75rem] sm:text-[2.5rem]">
            {labels.title}
          </SerifHeading>
          <p className="text-muted-foreground mx-auto mt-3 max-w-lg text-sm sm:text-base">
            {labels.subtitle}
          </p>
        </div>

        <div className="mx-auto mt-9 grid max-w-4xl gap-4 sm:grid-cols-2">
          <div className="bg-home-surface border-home-hairline rounded-home-card hover:border-home-accent-soft-border hover:shadow-home-lift flex flex-col gap-4 border p-6 transition-[border-color,box-shadow]">
            <div>
              <p className="text-home-accent-strong font-mono text-[11px] font-semibold tracking-[0.14em] uppercase">
                I&rsquo;m launching
              </p>
              <p className="font-editorial mt-2 text-xl font-semibold">Get seen on day one</p>
            </div>
            <ul className="space-y-2.5">
              {MAKER_POINTS.map((point) => (
                <li key={point} className="flex items-start gap-2.5 text-[13px]">
                  <RiCheckLine
                    className="text-home-accent-strong mt-0.5 size-4 flex-shrink-0"
                    aria-hidden="true"
                  />
                  <span className="text-muted-foreground">{point}</span>
                </li>
              ))}
            </ul>
            <PillButton asChild size="lg" full className="mt-auto">
              <Link href={primaryHref}>{labels.primaryCta}</Link>
            </PillButton>
          </div>

          <div className="bg-home-surface border-home-hairline rounded-home-card hover:border-home-highlight-soft-border hover:shadow-home-lift flex flex-col gap-4 border p-6 transition-[border-color,box-shadow]">
            <div>
              <p className="text-home-highlight-strong font-mono text-[11px] font-semibold tracking-[0.14em] uppercase">
                I&rsquo;m browsing
              </p>
              <p className="font-editorial mt-2 text-xl font-semibold">Find what to build next</p>
            </div>
            <ul className="space-y-2.5">
              {BROWSER_POINTS.map((point) => (
                <li key={point} className="flex items-start gap-2.5 text-[13px]">
                  <RiCheckLine
                    className="text-home-highlight-strong mt-0.5 size-4 flex-shrink-0"
                    aria-hidden="true"
                  />
                  <span className="text-muted-foreground">{point}</span>
                </li>
              ))}
            </ul>
            <PillButton asChild size="lg" variant="outline" full className="mt-auto">
              <Link href={secondaryHref}>
                {labels.secondaryCta}
                <RiArrowRightLine aria-hidden="true" />
              </Link>
            </PillButton>
          </div>
        </div>
      </div>
    </section>
  )
}
