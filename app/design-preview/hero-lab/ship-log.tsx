import { Link } from "@/i18n/navigation"
import { RiCheckLine, RiTerminalBoxLine } from "@remixicon/react"

import { PillButton } from "@/components/ds/pill-button"
import { SerifHeading } from "@/components/ds/serif-heading"
import { TagPill } from "@/components/ds/tag-pill"

import type { HeroConceptProps } from "./shared"

const RECEIPT_STEPS = [
  { label: "queued for the 08:00 UTC window", value: "ok" },
  { label: "verified badge issued", value: "ok" },
  { label: "do-follow backlink live", value: "ok" },
  { label: "listed on the home feed", value: "24h" },
] as const

/**
 * Concept 02 — Ship Log.
 *
 * Developer-native: the right half is the receipt you get after submitting,
 * written as a terminal session. The value proposition is not described, it is
 * shown as an artifact the audience already trusts. The dark card is a
 * deliberate contrast block in light mode and inverts in dark mode.
 */
export function ShipLogHero({
  labels,
  primaryHref,
  secondaryHref,
  headingLevel = "h1",
}: HeroConceptProps) {
  const Heading = headingLevel

  return (
    <section className="border-home-hairline rounded-home-card relative overflow-hidden border">
      <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-12 lg:items-center lg:gap-10 lg:p-10">
        <div className="lg:col-span-6">
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
            <PillButton asChild size="lg" variant="outline">
              <Link href={secondaryHref}>{labels.secondaryCta}</Link>
            </PillButton>
          </div>

          <p className="text-muted-foreground mt-5 font-mono text-[11px]">
            no queue for free submissions · 8 locales · open source
          </p>
        </div>

        <div className="lg:col-span-6">
          {/* `bg-home-ink` is the palette's own inverted surface, so this block
              reads as a terminal in light mode and as a light card in dark. */}
          <div className="bg-home-ink text-home-ink-foreground rounded-home-card overflow-hidden font-mono text-[12px] shadow-lg sm:text-[13px]">
            <div className="border-home-ink-foreground/15 flex items-center gap-2 border-b px-4 py-2.5">
              <RiTerminalBoxLine className="size-4 opacity-70" aria-hidden="true" />
              <span className="opacity-70">submit — aat.ee</span>
              <span className="ml-auto flex gap-1.5" aria-hidden="true">
                <span className="size-2 rounded-full bg-current opacity-25" />
                <span className="size-2 rounded-full bg-current opacity-25" />
                <span className="size-2 rounded-full bg-current opacity-25" />
              </span>
            </div>

            <div className="space-y-2.5 px-4 py-4">
              <p>
                <span className="opacity-50">$ </span>
                aat submit ./my-product
              </p>
              <p className="opacity-60">resolving project metadata…</p>
              <p className="opacity-60">screenshot + tagline extracted</p>
            </div>

            <ul className="border-home-ink-foreground/15 space-y-2 border-t px-4 py-4">
              {RECEIPT_STEPS.map((step) => (
                <li key={step.label} className="flex items-center gap-2.5">
                  <RiCheckLine
                    className="text-home-highlight-strong size-4 flex-shrink-0"
                    aria-hidden="true"
                  />
                  <span className="flex-1">{step.label}</span>
                  <span className="opacity-45">{step.value}</span>
                </li>
              ))}
            </ul>

            <div className="border-home-ink-foreground/15 flex items-center justify-between gap-3 border-t px-4 py-3">
              <span className="opacity-55">time to live</span>
              <TagPill tone="highlight">&lt; 1 day</TagPill>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
