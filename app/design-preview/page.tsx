import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { HeroLabFixture } from "./hero-lab-fixture"
import { HomeFixture } from "./home-fixture"
import { DesignSpecimen } from "./specimen"

export const metadata: Metadata = {
  title: "Home v2 design preview",
  robots: { index: false, follow: false },
}

// Read the gate env var per request instead of baking it in at build time, so
// flipping ENABLE_DESIGN_PREVIEW does not require a rebuild.
export const dynamic = "force-dynamic"

/**
 * Internal design harness for the home redesign (Phase 1: tokens + atoms).
 *
 * Deliberately NOT part of the localized `app/[locale]` tree — it is an
 * internal tool, not a page for visitors, so it takes no translations and is
 * excluded from the sitemap. It 404s in production unless
 * `ENABLE_DESIGN_PREVIEW=1` is set, and `app/robots.ts` disallows the path.
 *
 * When the database is unreachable (the shared layout resolves a session),
 * render the offline copy instead: `bun run design:preview`.
 */
export default function DesignPreviewPage() {
  if (process.env.NODE_ENV === "production" && process.env.ENABLE_DESIGN_PREVIEW !== "1") {
    notFound()
  }

  return (
    <>
      {/* Hero candidates first: this is the decision currently on the table. */}
      <HeroLabFixture />
      <div className="border-home-hairline border-t">
        <DesignSpecimen />
      </div>
      {/* Phase 2: the real home body against fixture data, so the review
          surface and the shipped layout are the same components. The offline
          export splits each of these into its own document
          (artifacts/design-preview/*.html). */}
      <div className="border-home-hairline border-t">
        <HomeFixture />
      </div>
    </>
  )
}
