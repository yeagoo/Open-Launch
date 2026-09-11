import { Link } from "@/i18n/navigation"

import { PillButton } from "@/components/ds/pill-button"
import { SerifHeading } from "@/components/ds/serif-heading"
import { HeroBrandMarquee } from "@/components/home/v2/hero-brand-marquee"

export interface HomeHeroLabels {
  title: string
  subtitle: string
  primaryCta: string
  secondaryCta: string
  /** e.g. "{count} products launched" — already interpolated by the caller. */
  launchedTotal: string
}

interface HomeHeroProps {
  labels: HomeHeroLabels
  /** Every launch the site has completed, all time. */
  launchedTotal: number
  /** Where the primary CTA points. */
  primaryHref: string
  /** Where the secondary CTA points. */
  secondaryHref: string
}

/**
 * Launch hero.
 *
 * The artwork is the product: two rows of brand marks drifting in opposite
 * directions behind the copy, faded into the page so the headline stays the LCP
 * element. It answers "is anything happening here?" before a word is read, and
 * the kicker states how many products have launched here in total — a fact
 * about the site's history rather than a snapshot of one quiet afternoon.
 *
 * Three constraints hold this together:
 *
 * 1. **The wall is decoration, not data.** It is `aria-hidden`, the marks are
 *    lazy and low priority, and the marquee is pure CSS — see
 *    `hero-brand-marquee.tsx` for where the marks come from and why.
 * 2. **The scrim is a tight radial, not a full wash.** A wash wide enough to be
 *    safe erases the wall and the concept with it; this keeps the marks legible
 *    at the edges while the centre stays readable.
 * 3. **Text first.** Nothing in the wall is above the copy in paint order or in
 *    the preload queue.
 */
export function HomeHero({ labels, launchedTotal, primaryHref, secondaryHref }: HomeHeroProps) {
  return (
    <section className="border-home-hairline rounded-home-card relative overflow-hidden border">
      <div
        aria-hidden="true"
        data-slot="home-hero-wall"
        // Dimmed as a whole in dark mode. A white chip on a near-black page
        // carries far more contrast than the same chip on a light one, so at
        // this density the wall stops reading as texture and starts competing
        // with the headline. Fading the layer is what makes it recede; pushing
        // the scrim harder instead only turns the chips into grey blocks.
        className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 dark:opacity-45"
      >
        <HeroBrandMarquee />
      </div>

      {/* Scrim: vertical for the top/bottom fade, radial to hold the copy
          block clear without flattening the whole wall.
          Tuned down from 55/70 once the wall became four rows: the earlier
          values were picked for two sparse rows, and at this density they left
          the marks nearly invisible. The radial still does the work of keeping
          the headline clear — it is opaque across the middle and fully
          transparent by 100%, so the marks fade in as they leave the copy. */}
      <div
        aria-hidden="true"
        className="from-background/25 via-background/40 to-background/85 pointer-events-none absolute inset-0 bg-gradient-to-b"
      />
      <div
        aria-hidden="true"
        className="home-hero-scrim-radial pointer-events-none absolute inset-0"
      />

      <div className="relative px-6 py-14 text-center sm:px-8 sm:py-20">
        {/* History, not today's snapshot. A cold start still has something
            true to say here as soon as one project has launched. */}
        {launchedTotal > 0 && (
          <p className="text-home-accent-strong font-mono text-[11px] font-semibold tracking-[0.16em] uppercase">
            {labels.launchedTotal}
          </p>
        )}

        {/* `text-balance` rather than plain wrapping: without it a long headline
            breaks on whatever fits, which strands the last two characters of a
            Chinese title on a line of their own. A wider measure gives CJK the
            room it needs — the same string is roughly twice as wide per
            character as Latin. */}
        <SerifHeading
          as="h1"
          size="display"
          className="mx-auto mt-4 max-w-3xl text-[1.75rem] text-balance sm:text-[2.6rem]"
        >
          {labels.title}
        </SerifHeading>

        <p className="text-muted-foreground mx-auto mt-4 max-w-lg text-sm sm:text-base">
          {labels.subtitle}
        </p>

        <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <PillButton asChild size="lg">
            <Link href={primaryHref}>{labels.primaryCta}</Link>
          </PillButton>
          <PillButton asChild size="lg" variant="outline">
            <Link href={secondaryHref}>{labels.secondaryCta}</Link>
          </PillButton>
        </div>
      </div>
    </section>
  )
}

export type { HomeHeroProps }
