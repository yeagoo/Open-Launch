/* eslint-disable @next/next/no-img-element */
import { Link } from "@/i18n/navigation"

import { PillButton } from "@/components/ds/pill-button"
import { SerifHeading } from "@/components/ds/serif-heading"

import type { HeroConceptProps } from "./shared"

const TILE_COUNT = 32

/**
 * Concept 06 — Launch Wall.
 *
 * The hero's artwork is the product itself: a mosaic of today's launches behind
 * the copy, faded into the page so the type stays readable. It answers "is
 * anything actually happening here?" before a single word is read.
 *
 * Perf note: this is the only concept whose decoration is made of images. The
 * tiles are decorative (`aria-hidden`, empty alt, lazy, plain <img>), and the
 * scrim is a CSS gradient, so the LCP element is still the headline — but the
 * tile count must stay bounded in production, and the wall should be built from
 * a single day's logos rather than the whole catalogue.
 */
export function LogoWallHero({
  labels,
  projects,
  makers,
  primaryHref,
  secondaryHref,
  headingLevel = "h1",
}: HeroConceptProps) {
  const Heading = headingLevel
  const sources = projects.filter((project): project is typeof project & { logoUrl: string } =>
    Boolean(project.logoUrl),
  )
  const tiles =
    sources.length > 0
      ? Array.from({ length: TILE_COUNT }, (_, index) => sources[index % sources.length])
      : []

  return (
    <section className="border-home-hairline rounded-home-card relative overflow-hidden border">
      {tiles.length > 0 && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 grid grid-cols-4 gap-4 p-6 sm:grid-cols-6 sm:gap-6 lg:grid-cols-8"
        >
          {tiles.map((tile, index) => (
            // No card chrome around the tiles: bare marks read as a wall of
            // products, boxes read as a table of contents.
            <span
              key={`${tile.id}-${index}`}
              className="flex aspect-square items-center justify-center"
              style={{ opacity: 0.3 + ((index * 7) % 5) * 0.12 }}
            >
              <img
                src={tile.logoUrl}
                alt=""
                loading="lazy"
                decoding="async"
                className="size-full object-contain"
              />
            </span>
          ))}
        </div>
      )}

      {/* Scrim: a tight radial keeps the centre readable while leaving the wall
          visible around it — a full-width wash would erase the whole point. */}
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
        <p className="font-mono text-[11px] font-semibold tracking-[0.16em] uppercase">
          <span className="text-home-accent-strong">128</span>
          <span className="text-muted-foreground"> launched today · </span>
          <span className="text-home-highlight-strong">12</span>
          <span className="text-muted-foreground"> queued</span>
        </p>

        <SerifHeading
          as={Heading}
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

        <div className="mt-7 flex items-center justify-center gap-3">
          <div className="flex -space-x-2">
            {makers.slice(0, 5).map((maker, index) => (
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
            ))}
          </div>
          <span className="text-muted-foreground text-xs sm:text-sm">{labels.joinMakers}</span>
        </div>
      </div>
    </section>
  )
}
