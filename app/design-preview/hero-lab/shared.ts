import type { HomeFeedProject } from "@/components/home/v2/ranked-row"

/**
 * Hero design lab.
 *
 * Six structurally different hero concepts for the home page, rendered side by
 * side so the layout can be chosen on its own merits instead of inherited.
 *
 * Two rules make the comparison honest:
 *
 * 1. **All six use the same headline, subtitle and CTAs.** What differs is the
 *    composition, the centerpiece and the supporting evidence — not the copy.
 *    Otherwise you end up choosing wording while believing you chose a layout.
 * 2. **All six use only the home palette tokens**, so each one renders in both
 *    themes without a per-concept dark-mode pass.
 *
 * These live under `app/design-preview/` on purpose: they are candidates, not
 * shipped UI. Whichever one wins gets promoted into
 * `components/home/v2/home-hero.tsx`, and only then do its concept-specific
 * strings need real translation keys (everything here is fixture English).
 */

export interface HeroConceptProps {
  /** Shared copy — identical across all six concepts. */
  labels: {
    title: string
    subtitle: string
    primaryCta: string
    secondaryCta: string
    joinMakers: string
    countdownLabel: string
  }
  /** Today's launches, already ranked by upvotes. */
  projects: HomeFeedProject[]
  /** The lab renders its own concept hero, so it carries its own maker shape. */
  makers: { id: string; name: string; image: string | null }[]
  stats: { launchesThisMonth: number; makers: number }
  /**
   * Pre-computed remaining time to the next launch window. Passed in rather
   * than measured so the static export (no JS) can show real digits instead of
   * the dash the live countdown falls back to.
   */
  countdownInitial: { hours: number; minutes: number; seconds: number }
  primaryHref: string
  secondaryHref: string
  /** Keeps the harness to a single h1: concepts render h2 there. */
  headingLevel?: "h1" | "h2"
}

/** English fixture copy, shared by every concept. */
export const HERO_LAB_LABELS: HeroConceptProps["labels"] = {
  title: "Where new products get their first push",
  subtitle:
    "Launch your product, earn a verified badge and a do-follow backlink, and discover what other makers shipped today.",
  primaryCta: "Submit your project",
  secondaryCta: "Explore today's launches",
  joinMakers: "Join 85,420 makers",
  countdownLabel: "New launches in",
}

export const HERO_LAB_COUNTDOWN = { hours: 20, minutes: 42, seconds: 22 }

export interface HeroConcept {
  id: string
  name: string
  /** What makes it structurally different — read this before picking. */
  idea: string
  bestFor: string
  watchOut: string
  Component: (props: HeroConceptProps) => React.ReactElement
}
