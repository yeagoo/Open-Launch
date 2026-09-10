/* eslint-disable @next/next/no-img-element */
import { Link } from "@/i18n/navigation"

import { PillButton } from "@/components/ds/pill-button"
import { SerifHeading } from "@/components/ds/serif-heading"

export interface HomeHeroMaker {
  id: string
  name: string
  image: string | null
}

export interface HomeHeroProject {
  id: string
  /** Nullable in practice: a project can exist before its logo resolves. */
  logoUrl: string | null
}

export interface HomeHeroLabels {
  title: string
  subtitle: string
  primaryCta: string
  secondaryCta: string
  /** e.g. "Join {count} makers" — already interpolated by the caller. */
  joinMakers: string
  /** e.g. "{count} launched today" — already interpolated by the caller. */
  launchedToday: string
  /** e.g. "{count} queued" — already interpolated by the caller. */
  queuedNext: string
}

interface HomeHeroProps {
  labels: HomeHeroLabels
  makers: HomeHeroMaker[]
  /**
   * Recent launches used as the wall texture. Decorative: the wall is
   * `aria-hidden` and the count in the kicker is a separate, real number, so
   * this list only has to be *representative* of the catalogue, not exhaustive
   * for the day.
   */
  wallProjects: HomeHeroProject[]
  /** Real count of launches in the current window. */
  launchesToday: number
  /** Real count of launches already scheduled for the next window. */
  queuedNext: number
  /** Where the primary CTA points. */
  primaryHref: string
  /** Where the secondary CTA points. */
  secondaryHref: string
}

/**
 * Launch Wall hero.
 *
 * The artwork is the product: a wall of recent launch logos behind the copy,
 * faded into the page so the headline stays the LCP element. It answers "is
 * anything happening here?" before a word is read, and the two numbers in the
 * kicker are real database counts rather than marketing filler.
 *
 * Three constraints hold this together:
 *
 * 1. **Tile count is bounded per breakpoint.** Exactly three rows render at
 *    every width (12 / 18 / 24 tiles), and the tiles that a breakpoint cannot
 *    show are `hidden` rather than clipped, so a phone never fetches 24 images
 *    for decoration. All of them are lazy, `aria-hidden` and plain `<img>` —
 *    routing 24 decorative 40px marks through the image optimizer would cost
 *    more than it saves.
 * 2. **The scrim is a tight radial, not a full wash.** A wash wide enough to be
 *    safe erases the wall and the concept with it; this keeps the logos legible
 *    at the edges while the centre stays readable.
 * 3. **Text first.** Nothing in the wall is above the copy in paint order or in
 *    the preload queue.
 */
export function HomeHero({
  labels,
  makers,
  wallProjects,
  launchesToday,
  queuedNext,
  primaryHref,
  secondaryHref,
}: HomeHeroProps) {
  // The predicate (not just truthiness) is what narrows `logoUrl` to a string
  // for the <img> below.
  const sources = wallProjects.filter((project): project is { id: string; logoUrl: string } =>
    Boolean(project.logoUrl),
  )
  // 24 ceiling = 3 rows at the widest grid; the modulo keeps the wall full even
  // when the catalogue is small, and the varied opacity hides the repeat.
  const tiles =
    sources.length > 0
      ? Array.from({ length: 24 }, (_, index) => sources[index % sources.length])
      : []

  return (
    <section className="border-home-hairline rounded-home-card relative overflow-hidden border">
      {tiles.length > 0 && (
        <div
          aria-hidden="true"
          data-slot="home-hero-wall"
          className="pointer-events-none absolute inset-0 grid grid-cols-4 gap-4 p-6 sm:grid-cols-6 sm:gap-6 lg:grid-cols-8"
        >
          {tiles.map((tile, index) => (
            <span
              key={`${tile.id}-${index}`}
              className={`flex aspect-square items-center justify-center ${
                // Three rows per breakpoint: 12 / 18 / 24.
                index >= 18 ? "hidden lg:flex" : index >= 12 ? "hidden sm:flex" : "flex"
              }`}
              // Bare marks, no card chrome: a boxed grid reads as a table of
              // contents, floating marks read as a wall of products.
              style={{ opacity: 0.3 + ((index * 7) % 5) * 0.12 }}
            >
              <img
                src={tile.logoUrl}
                alt=""
                loading="lazy"
                decoding="async"
                // The wall sits in the first viewport, so `lazy` alone still
                // fetches it on load. Pushing it to low priority keeps the
                // decorative tiles from competing with the LCP text for
                // connections.
                fetchPriority="low"
                className="size-full object-contain"
              />
            </span>
          ))}
        </div>
      )}

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
        {/* Cold start: with nothing live and nothing queued, "0 launched today
            · 0 queued" would be worse than saying nothing at all. */}
        {(launchesToday > 0 || queuedNext > 0) && (
          <p className="font-mono text-[11px] font-semibold tracking-[0.16em] uppercase">
            {launchesToday > 0 && (
              <span className="text-home-accent-strong">{labels.launchedToday}</span>
            )}
            {launchesToday > 0 && queuedNext > 0 && (
              <span className="text-muted-foreground"> · </span>
            )}
            {queuedNext > 0 && (
              <span className="text-home-highlight-strong">{labels.queuedNext}</span>
            )}
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
