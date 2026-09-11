/* eslint-disable @next/next/no-img-element */
import { Link } from "@/i18n/navigation"

import { PillButton } from "@/components/ds/pill-button"
import { SerifHeading } from "@/components/ds/serif-heading"
import { HeroBrandMarquee } from "@/components/home/v2/hero-brand-marquee"

export interface HomeHeroMaker {
  id: string
  name: string
  image: string | null
}

export interface HomeHeroLabels {
  title: string
  subtitle: string
  primaryCta: string
  secondaryCta: string
  /** e.g. "Join {count} makers" — already interpolated by the caller. */
  joinMakers: string
  /** e.g. "{count} products launched" — already interpolated by the caller. */
  launchedTotal: string
}

interface HomeHeroProps {
  labels: HomeHeroLabels
  makers: HomeHeroMaker[]
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
export function HomeHero({
  labels,
  makers,
  launchedTotal,
  primaryHref,
  secondaryHref,
}: HomeHeroProps) {
  return (
    <section className="border-home-hairline rounded-home-card relative overflow-hidden border">
      <div
        aria-hidden="true"
        data-slot="home-hero-wall"
        className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2"
      >
        <HeroBrandMarquee />
      </div>

      {/* Scrim: vertical for the top/bottom fade, radial to hold the copy
          block clear without flattening the whole wall. */}
      <div
        aria-hidden="true"
        className="from-background/55 via-background/70 to-background pointer-events-none absolute inset-0 bg-gradient-to-b"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(42% 46% at 50% 48%, var(--background) 0%, var(--background) 42%, transparent 100%)",
        }}
      />

      <div className="relative px-6 py-14 text-center sm:px-8 sm:py-20">
        {/* History, not today's snapshot. A cold start still has something
            true to say here as soon as one project has launched. */}
        {launchedTotal > 0 && (
          <p className="text-home-accent-strong font-mono text-[11px] font-semibold tracking-[0.16em] uppercase">
            {labels.launchedTotal}
          </p>
        )}

        <SerifHeading
          as="h1"
          size="display"
          className="mx-auto mt-4 max-w-2xl text-[2rem] sm:text-[3rem]"
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

        {(makers.length > 0 || labels.joinMakers) && (
          <div className="mt-7 flex items-center justify-center gap-3">
            {makers.length > 0 && (
              <div className="flex -space-x-2">
                {makers.slice(0, 5).map((maker, index) =>
                  maker.image ? (
                    <img
                      key={maker.id}
                      src={maker.image}
                      alt=""
                      width={28}
                      height={28}
                      loading="lazy"
                      decoding="async"
                      className="border-background bg-home-surface-muted size-7 rounded-full border-2 object-cover"
                    />
                  ) : (
                    // Most accounts never upload an avatar, so the stack must
                    // not collapse (or show broken images) without one.
                    <span
                      key={maker.id}
                      aria-hidden="true"
                      className="border-background text-home-accent-strong flex size-7 items-center justify-center rounded-full border-2 text-[10px] font-bold"
                      style={{
                        background: `color-mix(in oklab, var(--home-accent) ${
                          10 + index * 6
                        }%, var(--home-surface))`,
                      }}
                    >
                      {maker.name.trim().charAt(0).toUpperCase() || "?"}
                    </span>
                  ),
                )}
              </div>
            )}
            <span className="text-muted-foreground text-xs sm:text-sm">{labels.joinMakers}</span>
          </div>
        )}
      </div>
    </section>
  )
}

export type { HomeHeroProps }
