import type { Metadata } from "next"
import Link from "next/link"

import {
  RiArrowRightUpLine,
  RiCheckLine,
  RiInformationLine,
  RiLineChartLine,
  RiSearchEyeLine,
  RiShieldStarLine,
  RiSparkling2Line,
  RiStarLine,
} from "@remixicon/react"
import { getTranslations, setRequestLocale } from "next-intl/server"

import { DIRECTORY_PROMO } from "@/lib/directory-tiers"
import {
  DR_DOMAINS_BASIC,
  DR_DOMAINS_PLUS,
  DR_DOMAINS_PRO,
  DR_DOMAINS_PRO_PREVIEW,
  getDRBatch,
  type DRRecord,
} from "@/lib/dr"
import { buildLocaleAlternates, buildLocaleOpenGraph } from "@/lib/i18n-metadata"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DrBadge, DrBadgeRow, OverflowDrBadge } from "@/components/dr/dr-badge"
import { AnimatedWord } from "@/components/pricing/animated-word"
import { CopyPromoCode } from "@/components/pricing/copy-promo-code"

export const dynamic = "force-static"
export const revalidate = 3600 // 1h — DR badges are 3-day cached anyway

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: "pricingDirectories.metadata" })
  const path = "/pricing/directories"
  return {
    title: t("title"),
    description: t("description"),
    alternates: buildLocaleAlternates(path, locale),
    openGraph: {
      title: t("title"),
      description: t("description"),
      ...buildLocaleOpenGraph(path, locale),
      siteName: "aat.ee",
      type: "website",
    },
  }
}

export default async function DirectoryPricingPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)

  const t = await getTranslations("pricingDirectories")
  const drRecords = await getDRBatch(DR_DOMAINS_PRO)
  // `t.raw` lets us pull the array straight out of messages — `t()`
  // would coerce it to a stringified version. Fallback covers a
  // misconfigured locale so the heading still renders.
  const rotateWords = (() => {
    const raw = t.raw("hero.headingRotateWords")
    return Array.isArray(raw) && raw.length > 0 ? (raw as string[]) : ["product"]
  })()

  // Shared rich-text chunk map for tier reach lines. Wraps the
  // `<n>` portion ("4 sites", "12 个站点", …) in a primary-coloured
  // bold span so the count reads as a key metric, not running text.
  const reachChunks = {
    n: (chunks: React.ReactNode) => <span className="text-primary font-bold">{chunks}</span>,
  }

  return (
    <main className="bg-background min-h-screen">
      <div className="mx-auto max-w-6xl px-4 pt-16 pb-24 sm:pt-24">
        {/* ─── Hero — split layout. Left column: kicker badge,
            headline (with rotating colour-cycled product noun and a
            primary-gradient "directory network" accent), subhead with
            highlighted numbers, and the live 12-site DR pill row.
            Right column: an outcomes panel (4 metrics that move after
            running through the network). ─── */}
        <section className="mb-20 grid grid-cols-1 gap-12 sm:mb-24 lg:grid-cols-[1fr_minmax(0,460px)] lg:items-center">
          <div className="max-w-xl">
            <Badge
              variant="outline"
              className="bg-primary/5 text-primary border-primary/20 mb-5 font-mono text-[11px] tracking-wider uppercase"
            >
              {t("hero.kicker")}
            </Badge>
            <h1 className="font-editorial mb-5 text-4xl font-semibold tracking-tight sm:text-5xl">
              {t.rich("hero.heading", {
                rotate: () => <AnimatedWord words={rotateWords} />,
                accent: (chunks) => (
                  <span className="from-primary bg-gradient-to-r to-emerald-400 bg-clip-text text-transparent">
                    {chunks}
                  </span>
                ),
                // Optional explicit line break — Chinese heading
                // uses it so "推广到我们的导航网络" lands on row 2
                // and doesn't get split mid-character when the
                // rotating word's width changes. Tag is `lb`
                // (line-break) rather than `br` to avoid clashing
                // with HTML's void-element parsing in some ICU
                // message-format implementations. Other locales
                // simply omit the tag and wrap naturally.
                lb: () => <br />,
              })}
            </h1>
            <p className="text-muted-foreground text-base leading-relaxed sm:text-lg">
              {t.rich("hero.subheading", {
                n: DR_DOMAINS_PRO.length,
                num: (chunks) => (
                  <span className="text-primary font-semibold tabular-nums">{chunks}</span>
                ),
              })}
            </p>
            {/* Live DR pills for the entire 12-site network — directly
                under the subhead so the "12+ curated sites" claim has
                an immediate, scannable proof point. Refreshed by the
                refresh-dr cron every 3 days. */}
            <div className="mt-7">
              <DrBadgeRow records={drRecords} size="sm" />
              <p className="text-muted-foreground/80 mt-3 font-mono text-[10px] tracking-wider uppercase">
                {t("stats.drCardSubtitle")}
              </p>
            </div>
          </div>
          <OutcomesPanel
            kicker={t("hero.outcomes.kicker")}
            outcomes={[
              {
                accent: "emerald",
                icon: <RiLineChartLine className="h-5 w-5" />,
                title: t("hero.outcomes.trafficTitle"),
                desc: t("hero.outcomes.trafficDesc"),
              },
              {
                accent: "amber",
                icon: <RiShieldStarLine className="h-5 w-5" />,
                title: t("hero.outcomes.drTitle"),
                desc: t("hero.outcomes.drDesc"),
              },
              {
                accent: "blue",
                icon: <RiSearchEyeLine className="h-5 w-5" />,
                title: t("hero.outcomes.seoTitle"),
                desc: t("hero.outcomes.seoDesc"),
              },
              {
                accent: "violet",
                icon: <RiSparkling2Line className="h-5 w-5" />,
                title: t("hero.outcomes.aieoTitle"),
                desc: t("hero.outcomes.aieoDesc"),
              },
            ]}
          />
        </section>

        {/* ─── Test-phase promo banner. Stripe handles the actual
            discount via a native promotion code (configured in Stripe
            Dashboard); this is just the marketing surface so users
            know the code exists. Banner sits between the hero and
            the tier grid so it's seen *before* the price comparison.
            Disable site-wide by flipping `DIRECTORY_PROMO.enabled`
            in `lib/directory-tiers.ts`. */}
        {DIRECTORY_PROMO.enabled && (
          <section className="mb-8">
            <PromoBanner
              label={t("promoCode.label")}
              code={DIRECTORY_PROMO.code}
              headline={t("promoCode.headline")}
              subtext={t("promoCode.subtext")}
              warning={t("promoCode.warning")}
              copyLabel={t("promoCode.copy")}
              copiedLabel={t("promoCode.copied")}
            />
          </section>
        )}

        {/* ─── 4-tier grid (Basic / Plus / Pro / Ultra). Ultra
            also has a richer spotlight banner directly underneath
            for the elaborate pitch — the card here is the at-a-
            glance entry point so the four tiers can be scanned
            side by side. ─── */}
        <section className="mb-8">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
            <TierCard
              name={t("tiers.basic.name")}
              tagline={t("tiers.basic.tagline")}
              reach={t.rich("tiers.basic.reach", reachChunks)}
              price={t("tiers.basic.price")}
              originalPrice={t("tiers.basic.originalPrice")}
              billingNote={t("tiers.billing.oneOff")}
              cta={t("tiers.basic.cta")}
              ctaHref="/dashboard"
              features={[
                t("tiers.basic.features.skipQueue"),
                t("tiers.basic.features.dofollow"),
                t("tiers.basic.features.delivery"),
              ]}
              drRecords={drRecords.filter((r) => DR_DOMAINS_BASIC.includes(r.domain))}
            />

            <TierCard
              name={t("tiers.plus.name")}
              tagline={t("tiers.plus.tagline")}
              reach={t.rich("tiers.plus.reach", reachChunks)}
              price={t("tiers.plus.price")}
              originalPrice={t("tiers.plus.originalPrice")}
              billingNote={t("tiers.billing.oneOff")}
              cta={t("tiers.plus.cta")}
              ctaHref="/dashboard"
              features={[
                t("tiers.plus.features.everything"),
                t("tiers.plus.features.fourSites"),
                t("tiers.plus.features.stats"),
              ]}
              drRecords={drRecords.filter((r) => DR_DOMAINS_PLUS.includes(r.domain))}
            />

            <TierCard
              name={t("tiers.pro.name")}
              tagline={t("tiers.pro.tagline")}
              reach={t.rich("tiers.pro.reach", reachChunks)}
              price={t("tiers.pro.price")}
              originalPrice={t("tiers.pro.originalPrice")}
              billingNote={t("tiers.billing.oneOff")}
              badge={t("tiers.pro.badge")}
              highlighted
              cta={t("tiers.pro.cta")}
              ctaHref="/dashboard"
              features={[
                t("tiers.pro.features.everything"),
                t("tiers.pro.features.docsSites"),
                t("tiers.pro.features.stats"),
              ]}
              drRecords={drRecords.filter((r) => DR_DOMAINS_PRO_PREVIEW.includes(r.domain))}
              overflowRecords={drRecords.filter((r) => !DR_DOMAINS_PRO_PREVIEW.includes(r.domain))}
              overflowLabel={t("tiers.pro.overflowLabel", { n: DR_DOMAINS_PRO.length })}
              overflowTooltipHeading={t("tiers.pro.overflowTooltip")}
            />

            <UltraTierCard
              name={t("tiers.ultra.name")}
              subtitle={t("tiers.ultra.subtitle")}
              tagline={t("tiers.ultra.tagline")}
              price={t("tiers.ultra.price")}
              priceSuffix={t("tiers.ultra.priceSuffix")}
              billingNote={t("tiers.billing.subscription")}
              cta={t("tiers.ultra.cta")}
              limit={t("tiers.ultra.limit")}
              features={[
                t("tiers.ultra.features.everything"),
                t("tiers.ultra.features.sidebar"),
                t("tiers.ultra.features.exclusive"),
              ]}
            />
          </div>
        </section>

        {/* ─── Price-change notice (after tier grid) ─── */}
        <PriceNotice text={t("priceNotice")} className="mb-12" />

        {/* ─── Ultra spotlight (elaborate pitch) ─── */}
        <section className="mb-20">
          <UltraCard
            name={t("tiers.ultra.name")}
            subtitle={t("tiers.ultra.subtitle")}
            tagline={t("tiers.ultra.tagline")}
            description={t("tiers.ultra.description")}
            limit={t("tiers.ultra.limit")}
            price={t("tiers.ultra.price")}
            priceSuffix={t("tiers.ultra.priceSuffix")}
            billingNote={t("tiers.billing.subscription")}
            cta={t("tiers.ultra.cta")}
            features={[
              t("tiers.ultra.features.everything"),
              t("tiers.ultra.features.sidebar"),
              t("tiers.ultra.features.exclusive"),
              t("tiers.ultra.features.cancel"),
            ]}
          />
        </section>

        {/* ─── Stats / DR badges ─── */}
        <section className="mb-20">
          <h2 className="font-editorial mb-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            {t("stats.heading")}
          </h2>
          <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatTile
              label={t("stats.trafficLine")}
              value={t("stats.trafficValue")}
              note={t("stats.trafficNote")}
            />
            <StatTile
              label={t("stats.clicksLine")}
              value={t("stats.clicksValue")}
              note={t("stats.clicksNote")}
            />
            <StatTile
              label={t("stats.sitesLine")}
              value={t("stats.sitesValue")}
              note={t("stats.sitesNote")}
            />
          </div>
        </section>

        {/* ─── Comparison table ─── */}
        <section className="mb-20">
          <h2 className="font-editorial mb-6 text-2xl font-semibold tracking-tight sm:text-3xl">
            {t("comparison.heading")}
          </h2>
          <div className="bg-card overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="border-b">
                <tr className="text-left">
                  <th className="text-muted-foreground px-4 py-3 font-medium">&nbsp;</th>
                  <th className="px-4 py-3 font-medium">{t("tiers.basic.name")}</th>
                  <th className="px-4 py-3 font-medium">{t("tiers.plus.name")}</th>
                  <th className="bg-primary/5 px-4 py-3 font-semibold">{t("tiers.pro.name")}</th>
                  <th className="px-4 py-3 font-medium">{t("tiers.ultra.name")}</th>
                </tr>
              </thead>
              <tbody className="divide-border/60 divide-y">
                <ComparisonRow
                  label={t("comparison.rows.sites")}
                  values={[
                    t("comparison.values.basicSites"),
                    t("comparison.values.plusSites"),
                    t("comparison.values.proSites"),
                    t("comparison.values.ultraSites"),
                  ]}
                />
                <ComparisonRow
                  label={t("comparison.rows.skipQueue")}
                  values={[true, true, true, true]}
                />
                <ComparisonRow
                  label={t("comparison.rows.dofollow")}
                  values={[true, true, true, true]}
                />
                <ComparisonRow
                  label={t("comparison.rows.extraPages")}
                  values={[true, true, true, true]}
                />
                <ComparisonRow
                  label={t("comparison.rows.docsLinks")}
                  values={[false, false, true, true]}
                />
                <ComparisonRow
                  label={t("comparison.rows.sidebarAd")}
                  values={[false, false, false, true]}
                />
                <ComparisonRow
                  label={t("comparison.rows.monthlyTraffic")}
                  values={[
                    t("comparison.values.basicTraffic"),
                    t("comparison.values.plusTraffic"),
                    t("comparison.values.proTraffic"),
                    t("comparison.values.ultraTraffic"),
                  ]}
                />
                <ComparisonRow
                  label={t("comparison.rows.googleClicks")}
                  values={[
                    t("comparison.values.basicClicks"),
                    t("comparison.values.plusClicks"),
                    t("comparison.values.proClicks"),
                    t("comparison.values.ultraClicks"),
                  ]}
                />
                <ComparisonRow
                  label={t("comparison.rows.delivery")}
                  values={[
                    t("comparison.values.auto1d"),
                    t("comparison.values.manual3d"),
                    t("comparison.values.manual3d"),
                    t("comparison.values.manual3d"),
                  ]}
                />
                <ComparisonRow
                  label={t("comparison.rows.urlScope")}
                  values={[
                    t("comparison.values.oneUrl"),
                    t("comparison.values.oneUrl"),
                    t("comparison.values.oneUrl"),
                    t("comparison.values.sponsorSlot"),
                  ]}
                />
                <ComparisonRow
                  label={t("comparison.rows.billing")}
                  values={[
                    t("comparison.values.oneOff"),
                    t("comparison.values.oneOff"),
                    t("comparison.values.oneOff"),
                    t("comparison.values.subscription"),
                  ]}
                />
              </tbody>
            </table>
          </div>
          <PriceNotice text={t("priceNotice")} className="mt-6" />
        </section>

        {/* ─── FAQ ─── */}
        <section className="mb-20">
          <h2 className="font-editorial mb-6 text-2xl font-semibold tracking-tight sm:text-3xl">
            {t("faq.heading")}
          </h2>
          <Accordion type="single" collapsible className="bg-card rounded-xl border px-4">
            {(["discount", "delivery", "retention", "upgrade", "refund", "multiple"] as const).map(
              (key) => (
                <AccordionItem key={key} value={key}>
                  <AccordionTrigger className="text-left text-base font-medium">
                    {t(`faq.items.${key}.q`)}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground text-sm leading-relaxed">
                    {t(`faq.items.${key}.a`)}
                  </AccordionContent>
                </AccordionItem>
              ),
            )}
          </Accordion>
        </section>

        {/* ─── Footer CTA ─── */}
        <section className="bg-card rounded-xl border p-8 text-center sm:p-12">
          <h2 className="font-editorial mb-3 text-2xl font-semibold tracking-tight sm:text-3xl">
            {t("footer.heading")}
          </h2>
          <p className="text-muted-foreground mx-auto mb-6 max-w-xl text-sm sm:text-base">
            {t("footer.body")}
          </p>
          <Button size="lg" asChild>
            <Link href="/projects/submit">{t("tiers.basic.cta")}</Link>
          </Button>
        </section>
      </div>
    </main>
  )
}

// ─── Inline components ───

interface TierCardProps {
  name: string
  tagline: string
  // One-line metric strip below the price. ReactNode (not string) so
  // the caller can wrap the count portion in `<n>` rich-text chunks
  // and emphasise it without losing translation flexibility.
  reach: React.ReactNode
  price: string
  originalPrice: string
  // Prominent "One-time payment" chip under the price. Required so
  // every paid card answers the "is this monthly?" question without
  // the user having to scroll to the comparison table.
  billingNote: string
  badge?: string
  highlighted?: boolean
  cta: string
  ctaHref: string
  // Only the 3 most decisive bullets — full feature list lives in the
  // comparison table.
  features: string[]
  // DR pills to render under the reach line. Capped upstream so we
  // don't drown the card.
  drRecords: DRRecord[]
  // Optional overflow pill rendered after the visible DR pills. Used
  // by Pro to hide the bulk of the 12-site network behind a hover
  // tooltip while keeping the card scannable.
  overflowRecords?: DRRecord[]
  overflowLabel?: string
  overflowTooltipHeading?: string
}

function TierCard(props: TierCardProps) {
  return (
    // No `overflow-hidden` here — the "Most popular" badge sits at
    // `-top-3` and would otherwise be clipped by the rounded border.
    <div
      className={`bg-card relative flex flex-col rounded-xl border p-6 ${
        props.highlighted ? "border-primary ring-primary/20 ring-2" : ""
      }`}
    >
      {props.badge && (
        <Badge
          variant="default"
          className="bg-primary text-primary-foreground absolute -top-3 left-1/2 -translate-x-1/2"
        >
          {props.badge}
        </Badge>
      )}

      {/* Tier name styled like a heading but rendered as a plain
          span — the page already has `<h2>`s for each major section
          (Stats, Comparison, FAQ); using `<h3>` here would skip the
          missing tier-grid `<h2>` and break the heading outline. */}
      <span className="font-editorial text-2xl font-semibold tracking-tight">{props.name}</span>
      <p className="text-muted-foreground mt-1.5 text-sm">{props.tagline}</p>

      <div className="mt-6 flex items-baseline gap-2">
        <span className="font-editorial text-4xl font-semibold tabular-nums">{props.price}</span>
        <span className="text-muted-foreground text-sm tabular-nums line-through">
          {props.originalPrice}
        </span>
      </div>
      {/* Billing chip — emerald pill so the one-off payment scope
          can't be missed. Without this, the 4 stacked tier cards
          (Basic / Plus / Pro / Ultra) read at a glance like four
          monthly plans of different sizes, since Ultra IS monthly. */}
      <div className="mt-2 mb-4">
        <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-emerald-700 ring-1 ring-emerald-500/20 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/20">
          {props.billingNote}
        </span>
      </div>

      <div className="border-border/60 mb-5 space-y-2 border-y py-3">
        {/* `<div>` (not `<p>`) — `reach` is `ReactNode` so a future
            caller could legitimately pass block content. */}
        <div className="text-muted-foreground font-mono text-[11px] tracking-wide uppercase">
          {props.reach}
        </div>
        {(props.drRecords.length > 0 ||
          (props.overflowRecords && props.overflowRecords.length > 0)) && (
          <div className="flex flex-wrap gap-1.5">
            {props.drRecords.map((r) => (
              <DrBadge key={r.domain} record={r} size="sm" />
            ))}
            {props.overflowRecords && props.overflowRecords.length > 0 && props.overflowLabel && (
              <OverflowDrBadge
                records={props.overflowRecords}
                label={props.overflowLabel}
                tooltipHeading={props.overflowTooltipHeading ?? ""}
                size="sm"
              />
            )}
          </div>
        )}
      </div>

      <ul className="mb-6 flex-1 space-y-2.5 text-sm">
        {props.features.map((f) => (
          <li key={f} className="flex items-start gap-2">
            <RiCheckLine className="text-primary mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <Button asChild variant={props.highlighted ? "default" : "outline"} className="w-full">
        <Link href={props.ctaHref}>{props.cta}</Link>
      </Button>
    </div>
  )
}

// Hero right-column: outcome panel. Each row pairs an icon with a
// concrete metric you can expect to move after running through the
// directory network. Per-row accent colours keep the four outcomes
// visually distinct without making the panel feel like a rainbow —
// the icon background is the only tinted surface.
type OutcomeAccent = "emerald" | "amber" | "blue" | "violet"

interface Outcome {
  accent: OutcomeAccent
  icon: React.ReactNode
  title: string
  desc: string
}

interface OutcomesPanelProps {
  kicker: string
  outcomes: Outcome[]
}

// Tailwind needs the full class strings present at build time so the
// JIT compiler keeps them — that's why this map is exhaustive instead
// of dynamic interpolation.
const OUTCOME_ACCENT_CLASSES: Record<OutcomeAccent, string> = {
  emerald:
    "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-300 ring-emerald-500/20",
  amber:
    "bg-amber-500/10 text-amber-600 dark:bg-amber-400/10 dark:text-amber-300 ring-amber-500/20",
  blue: "bg-blue-500/10 text-blue-600 dark:bg-blue-400/10 dark:text-blue-300 ring-blue-500/20",
  violet:
    "bg-violet-500/10 text-violet-600 dark:bg-violet-400/10 dark:text-violet-300 ring-violet-500/20",
}

function OutcomesPanel({ kicker, outcomes }: OutcomesPanelProps) {
  return (
    <div className="bg-card border-border/70 rounded-2xl border p-6 shadow-sm sm:p-7">
      <p className="text-muted-foreground mb-6 font-mono text-[11px] tracking-wider uppercase">
        {kicker}
      </p>
      <ul className="space-y-5">
        {outcomes.map((o) => (
          <li key={o.title} className="flex gap-4">
            <div
              className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg ring-1 ${OUTCOME_ACCENT_CLASSES[o.accent]}`}
            >
              {o.icon}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                {/* Styled as a heading but rendered as `<p>` — the
                    page has no `<h2>` between the hero `<h1>` and
                    these labels, so a true `<h3>` would skip a level
                    in the outline. */}
                <p className="font-editorial text-base font-semibold tracking-tight">{o.title}</p>
                <RiArrowRightUpLine className="text-muted-foreground/60 h-3.5 w-3.5" />
              </div>
              <p className="text-muted-foreground mt-1 text-sm leading-relaxed">{o.desc}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

// Compact in-grid Ultra card. Uses violet tinting so it stays
// visually distinct from Pro (primary green) and from the
// full-width Ultra spotlight banner below (dark + amber).
interface UltraTierCardProps {
  name: string
  subtitle: string
  tagline: string
  price: string
  priceSuffix: string
  // Violet "Monthly · cancel anytime" pill — mirrors the emerald
  // "One-time payment" pill on the other 3 tiers so the user can
  // tell at a glance which cards are subscription vs one-off.
  billingNote: string
  cta: string
  limit: string
  features: string[]
}

function UltraTierCard(props: UltraTierCardProps) {
  return (
    <div className="relative flex flex-col overflow-hidden rounded-xl border border-violet-200 bg-violet-50 p-6 dark:border-violet-900/40 dark:bg-violet-950/20">
      <div className="mb-1 flex items-center gap-1.5">
        <RiStarLine className="h-3.5 w-3.5 text-violet-600 dark:text-violet-300" />
        <span className="font-mono text-[11px] tracking-wider text-violet-700 uppercase dark:text-violet-300">
          {props.subtitle}
        </span>
      </div>
      {/* See TierCard: rendered as `<span>` to keep the heading
          outline intact. */}
      <span className="font-editorial text-2xl font-semibold tracking-tight">{props.name}</span>
      <p className="text-muted-foreground mt-1.5 text-sm">{props.tagline}</p>

      <div className="mt-6 flex items-baseline gap-1">
        <span className="font-editorial text-4xl font-semibold tabular-nums">{props.price}</span>
        <span className="text-muted-foreground text-sm">{props.priceSuffix}</span>
      </div>
      {/* Violet billing chip — sets visual contrast with the
          emerald "One-time" chips on the other three cards so the
          subscription nature is unmistakable. */}
      <div className="mt-2 mb-4">
        <span className="inline-flex items-center rounded-full bg-violet-500/10 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-violet-700 ring-1 ring-violet-500/20 dark:bg-violet-400/10 dark:text-violet-200 dark:ring-violet-400/20">
          {props.billingNote}
        </span>
      </div>

      <div className="mb-5 border-y border-violet-200/70 py-3 dark:border-violet-900/50">
        <p className="font-mono text-[11px] tracking-wide text-violet-700 uppercase dark:text-violet-300">
          {props.limit}
        </p>
      </div>

      <ul className="mb-6 flex-1 space-y-2.5 text-sm">
        {props.features.map((f) => (
          <li key={f} className="flex items-start gap-2">
            <RiCheckLine className="mt-0.5 h-4 w-4 flex-shrink-0 text-violet-600 dark:text-violet-300" />
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <Button asChild className="w-full bg-violet-600 text-white hover:bg-violet-700">
        <Link href="/dashboard">{props.cta}</Link>
      </Button>
    </div>
  )
}

interface UltraCardProps {
  name: string
  subtitle: string
  tagline: string
  description: string
  limit: string
  price: string
  priceSuffix: string
  billingNote: string
  cta: string
  features: string[]
}

function UltraCard(props: UltraCardProps) {
  return (
    <div className="border-foreground/20 bg-foreground text-background relative overflow-hidden rounded-xl border p-6 sm:p-8">
      <div className="absolute -top-12 -right-12 h-48 w-48 rounded-full bg-amber-400/10 blur-3xl" />
      <div className="relative grid grid-cols-1 gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <RiStarLine className="h-4 w-4 text-amber-400" />
            <span className="font-mono text-xs tracking-wider text-amber-400 uppercase">
              {props.subtitle}
            </span>
          </div>
          <h2 className="font-editorial mb-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            {props.name}
          </h2>
          <p className="text-background/80 mb-4 text-base sm:text-lg">{props.tagline}</p>
          <p className="text-background/70 mb-5 max-w-xl text-sm leading-relaxed">
            {props.description}
          </p>
          <ul className="mb-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            {props.features.map((f) => (
              <li key={f} className="flex items-start gap-2">
                <RiCheckLine className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-400" />
                <span className="text-background/90">{f}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs font-medium text-amber-400">{props.limit}</p>
        </div>
        <div className="border-background/20 sm:border-l sm:pl-8 lg:min-w-[240px]">
          <div className="mb-2 flex items-baseline gap-1">
            <span className="font-editorial text-4xl font-semibold tabular-nums">
              {props.price}
            </span>
            <span className="text-background/70 text-sm">{props.priceSuffix}</span>
          </div>
          {/* Amber chip on the dark Ultra spotlight — makes the
              monthly / cancel-anytime nature explicit and matches
              the violet chip in the in-grid Ultra card above. */}
          <div className="mb-4">
            <span className="inline-flex items-center rounded-full bg-amber-400/15 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-amber-300 ring-1 ring-amber-400/30">
              {props.billingNote}
            </span>
          </div>
          <Button
            size="lg"
            className="w-full bg-amber-400 text-zinc-950 hover:bg-amber-300"
            asChild
          >
            <Link href="/dashboard">{props.cta}</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}

// Primary-tinted stat tile used in the "what you're buying" row.
// Visually leans on the brand color so the numbers feel like real
// trust signals rather than yet another card on the page.
function StatTile({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="bg-primary/5 border-primary/20 rounded-xl border p-5">
      <p className="text-primary text-xs font-medium tracking-wider uppercase">{label}</p>
      <p className="font-editorial text-foreground mt-2 text-4xl font-semibold tabular-nums">
        {value}
      </p>
      <p className="text-muted-foreground mt-3 text-xs leading-relaxed">{note}</p>
    </div>
  )
}

// Promo banner — visible above the tier grid so the discount is
// known *before* the user anchors on a price. Primary-tinted card
// with the code itself as a click-to-copy pill on the right; a
// secondary line below states the test-phase / expiry warning so
// expectations are honest about availability.
function PromoBanner({
  label,
  code,
  headline,
  subtext,
  warning,
  copyLabel,
  copiedLabel,
}: {
  label: string
  code: string
  headline: string
  subtext: string
  warning: string
  copyLabel: string
  copiedLabel: string
}) {
  return (
    <div className="border-primary/30 from-primary/10 via-primary/5 relative overflow-hidden rounded-xl border bg-gradient-to-br to-transparent p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-primary mb-1 font-mono text-[11px] tracking-wider uppercase">
            {label}
          </p>
          <p className="font-editorial text-foreground text-xl font-semibold tracking-tight sm:text-2xl">
            {headline}
          </p>
          <p className="text-muted-foreground mt-1 text-sm">{subtext}</p>
        </div>
        <div className="flex-shrink-0">
          <CopyPromoCode code={code} copyLabel={copyLabel} copiedLabel={copiedLabel} />
        </div>
      </div>
      <p className="text-muted-foreground/90 border-primary/20 mt-4 border-t pt-3 text-xs">
        ⚠️ {warning}
      </p>
    </div>
  )
}

// Inline reminder that the discount prices are not permanent. Amber
// tinted (informational, not warning) so it reads as a heads-up
// rather than alarm. Used both under the tier grid and under the
// comparison table — the same string in both spots is intentional:
// price-anchored conversions happen at those two scroll depths.
function PriceNotice({ text, className }: { text: string; className?: string }) {
  return (
    <div
      className={`flex items-start gap-2.5 rounded-lg border border-amber-500/25 bg-amber-500/5 px-4 py-3 ${
        className ?? ""
      }`}
    >
      <RiInformationLine className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-400" />
      <p className="text-foreground/80 text-xs leading-relaxed sm:text-[13px]">{text}</p>
    </div>
  )
}

function ComparisonRow({ label, values }: { label: string; values: (string | boolean)[] }) {
  return (
    <tr>
      <th className="text-muted-foreground px-4 py-3 text-left font-medium">{label}</th>
      {values.map((v, i) => (
        <td
          key={i}
          className={`px-4 py-3 ${i === 2 ? "bg-primary/5 font-medium" : "text-muted-foreground"}`}
        >
          {typeof v === "boolean" ? (
            v ? (
              <RiCheckLine className="text-primary h-4 w-4" />
            ) : (
              <span>—</span>
            )
          ) : (
            v
          )}
        </td>
      ))}
    </tr>
  )
}
