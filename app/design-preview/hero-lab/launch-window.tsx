import { Link } from "@/i18n/navigation"

import { PillButton } from "@/components/ds/pill-button"
import { SerifHeading } from "@/components/ds/serif-heading"

import type { HeroConceptProps } from "./shared"

/**
 * Concept 04 — Launch Window.
 *
 * The site's real mechanic (a batch goes live every day at 08:00 UTC) becomes
 * the hero's centerpiece: three oversized digits tiles plus a timeline that
 * shows where "now" sits between yesterday's batch and the next one. Scarcity
 * is structural rather than a countdown bolted onto a slogan.
 */
export function LaunchWindowHero({
  labels,
  countdownInitial,
  primaryHref,
  secondaryHref,
  headingLevel = "h1",
}: HeroConceptProps) {
  const Heading = headingLevel
  const tiles = [
    { value: countdownInitial.hours, unit: "hours" },
    { value: countdownInitial.minutes, unit: "minutes" },
    { value: countdownInitial.seconds, unit: "seconds" },
  ]

  return (
    <section className="border-home-hairline rounded-home-card relative overflow-hidden border">
      <div
        aria-hidden="true"
        className="home-grid-bg home-grid-fade pointer-events-none absolute inset-0"
      />
      <div className="relative px-6 py-10 text-center sm:px-8 sm:py-14">
        {/* The headline leads the DOM so the h1 is not buried under the
            widget — the countdown still wins on visual weight, but reading
            order and screen-reader order stay sane. */}
        <SerifHeading as={Heading} size="section" className="mx-auto max-w-xl text-xl sm:text-2xl">
          {labels.title}
        </SerifHeading>
        <p className="text-muted-foreground mx-auto mt-3 max-w-md text-sm">{labels.subtitle}</p>

        <p className="text-muted-foreground mt-9 font-mono text-[11px] font-semibold tracking-[0.14em] uppercase">
          {labels.countdownLabel}
        </p>

        <div className="mt-5 flex items-start justify-center gap-2 sm:gap-4">
          {tiles.map((tile, index) => (
            <div key={tile.unit} className="flex items-start gap-2 sm:gap-4">
              <div className="bg-home-surface border-home-hairline rounded-home-card min-w-[4.5rem] border px-3 py-3 sm:min-w-[6rem] sm:px-5 sm:py-4">
                <span className="block font-mono text-3xl leading-none font-bold tabular-nums sm:text-5xl">
                  {String(tile.value).padStart(2, "0")}
                </span>
                <span className="text-muted-foreground mt-1.5 block text-[10px] tracking-wider uppercase sm:text-[11px]">
                  {tile.unit}
                </span>
              </div>
              {index < tiles.length - 1 && (
                <span className="text-muted-foreground pt-2 text-2xl font-light sm:pt-3 sm:text-4xl">
                  :
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Timeline: yesterday's batch, the batch running now, the next one. */}
        <div className="mx-auto mt-9 max-w-xl">
          <div className="text-muted-foreground flex items-center justify-between font-mono text-[10px] tracking-wider uppercase">
            <span>Yesterday</span>
            <span className="text-foreground">Today · live</span>
            <span>Next window</span>
          </div>
          <div className="bg-home-surface-muted border-home-hairline relative mt-2 h-2 overflow-hidden rounded-full border">
            <span className="bg-home-highlight/70 absolute inset-y-0 left-0 w-1/2" />
            <span className="bg-home-accent absolute inset-y-0 left-1/2 w-[14%]" />
          </div>
          <p className="text-muted-foreground mt-3 text-xs">
            <span className="text-foreground font-mono font-semibold">12</span> projects queued for
            the next window · <span className="text-foreground font-mono font-semibold">128</span>{" "}
            live today
          </p>
        </div>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <PillButton asChild size="lg">
            <Link href={primaryHref}>{labels.primaryCta}</Link>
          </PillButton>
          <PillButton asChild size="lg" variant="ghost">
            <Link href={secondaryHref}>{labels.secondaryCta} →</Link>
          </PillButton>
        </div>
      </div>
    </section>
  )
}
