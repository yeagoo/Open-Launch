import type { Metadata } from "next"
import Link from "next/link"

import { RiCheckLine, RiSparkling2Line, RiStarLine } from "@remixicon/react"
import { getTranslations, setRequestLocale } from "next-intl/server"

import { DR_DOMAINS_BASIC, DR_DOMAINS_PLUS, DR_DOMAINS_PRO, getDRBatch } from "@/lib/dr"
import { buildLocaleAlternates, buildLocaleOpenGraph } from "@/lib/i18n-metadata"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DrBadgeRow } from "@/components/dr/dr-badge"

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

  return (
    <main className="bg-background min-h-screen">
      <div className="mx-auto max-w-6xl px-4 pt-12 pb-24 sm:pt-16">
        {/* ─── Hero ─── */}
        <section className="mb-16 max-w-3xl">
          <p className="text-muted-foreground mb-2 font-mono text-xs tracking-wider uppercase">
            {t("hero.kicker")}
          </p>
          <h1 className="font-editorial mb-4 text-4xl font-semibold tracking-tight sm:text-5xl">
            {t("hero.heading")}
          </h1>
          <p className="text-muted-foreground text-base leading-relaxed sm:text-lg">
            {t("hero.subheading", { n: DR_DOMAINS_PRO.length })}
          </p>
          <div className="mt-6 inline-flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-900 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-100">
            <RiSparkling2Line className="h-3.5 w-3.5" />
            {t("hero.limited")}
          </div>
        </section>

        {/* ─── 3-tier grid (Basic / Plus / Pro) ─── */}
        <section className="mb-8">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            <TierCard
              name={t("tiers.basic.name")}
              tagline={t("tiers.basic.tagline")}
              description={t("tiers.basic.description")}
              price={t("tiers.basic.price")}
              originalPrice={t("tiers.basic.originalPrice")}
              cta={t("tiers.basic.cta")}
              ctaHref="#contact"
              features={[
                t("tiers.basic.features.skipQueue"),
                t("tiers.basic.features.dofollow"),
                t("tiers.basic.features.site"),
                t("tiers.basic.features.extra"),
                t("tiers.basic.features.delivery"),
              ]}
              drDomains={DR_DOMAINS_BASIC}
              records={drRecords}
            />

            <TierCard
              name={t("tiers.plus.name")}
              tagline={t("tiers.plus.tagline")}
              description={t("tiers.plus.description")}
              price={t("tiers.plus.price")}
              originalPrice={t("tiers.plus.originalPrice")}
              cta={t("tiers.plus.cta")}
              ctaHref="#contact"
              features={[
                t("tiers.plus.features.everything"),
                t("tiers.plus.features.fourSites"),
                t("tiers.plus.features.dofollowAll"),
                t("tiers.plus.features.stats"),
                t("tiers.plus.features.delivery"),
              ]}
              drDomains={DR_DOMAINS_PLUS}
              records={drRecords}
            />

            <TierCard
              name={t("tiers.pro.name")}
              tagline={t("tiers.pro.tagline")}
              description={t("tiers.pro.description")}
              price={t("tiers.pro.price")}
              originalPrice={t("tiers.pro.originalPrice")}
              badge={t("tiers.pro.badge")}
              highlighted
              cta={t("tiers.pro.cta")}
              ctaHref="#contact"
              features={[
                t("tiers.pro.features.everything"),
                t("tiers.pro.features.docsSites"),
                t("tiers.pro.features.geo"),
                t("tiers.pro.features.stats"),
                t("tiers.pro.features.delivery"),
              ]}
              drDomains={DR_DOMAINS_PRO}
              records={drRecords}
            />
          </div>
        </section>

        {/* ─── Ultra (sponsorship) full-width row ─── */}
        <section className="mb-20">
          <UltraCard
            name={t("tiers.ultra.name")}
            subtitle={t("tiers.ultra.subtitle")}
            tagline={t("tiers.ultra.tagline")}
            description={t("tiers.ultra.description")}
            limit={t("tiers.ultra.limit")}
            price={t("tiers.ultra.price")}
            priceSuffix={t("tiers.ultra.priceSuffix")}
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
          <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="bg-card rounded-xl border p-5">
              <p className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
                {t("stats.trafficLine")}
              </p>
              <p className="mt-1 font-mono text-3xl font-semibold tabular-nums">
                {t("stats.trafficValue")}
              </p>
              <p className="text-muted-foreground mt-2 text-xs">{t("stats.trafficNote")}</p>
            </div>
            <div className="bg-card rounded-xl border p-5">
              <p className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
                {t("stats.clicksLine")}
              </p>
              <p className="mt-1 font-mono text-3xl font-semibold tabular-nums">
                {t("stats.clicksValue")}
              </p>
              <p className="text-muted-foreground mt-2 text-xs">{t("stats.trafficNote")}</p>
            </div>
          </div>
          <div className="bg-card rounded-xl border p-5">
            <div className="mb-3 flex items-baseline justify-between">
              <h3 className="font-editorial text-lg font-semibold">{t("stats.drCardTitle")}</h3>
              <span className="text-muted-foreground text-xs">{t("stats.drCardSubtitle")}</span>
            </div>
            <DrBadgeRow records={drRecords} size="md" />
            <p className="text-muted-foreground mt-4 text-xs leading-relaxed">
              {t("stats.drDisclaimer")}
            </p>
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
        <section id="contact" className="bg-card rounded-xl border p-8 text-center sm:p-12">
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
  description: string
  price: string
  originalPrice: string
  badge?: string
  highlighted?: boolean
  cta: string
  ctaHref: string
  features: string[]
  drDomains: readonly string[]
  records: { domain: string; dr: number | null; fetchedAt: Date | null; isFresh: boolean }[]
}

function TierCard(props: TierCardProps) {
  const tierRecords = props.records.filter((r) => props.drDomains.includes(r.domain))

  return (
    <div
      className={`bg-card relative flex flex-col overflow-hidden rounded-xl border p-5 ${
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

      <div className="mb-3">
        <h3 className="font-editorial text-2xl font-semibold tracking-tight">{props.name}</h3>
        <p className="text-muted-foreground mt-1 text-sm">{props.tagline}</p>
      </div>

      <div className="mb-3 flex items-baseline gap-2">
        <span className="font-editorial text-3xl font-semibold tabular-nums">{props.price}</span>
        <span className="text-muted-foreground text-sm tabular-nums line-through">
          {props.originalPrice}
        </span>
      </div>

      <p className="text-muted-foreground mb-4 text-xs leading-relaxed">{props.description}</p>

      <ul className="mb-5 flex-1 space-y-2 text-sm">
        {props.features.map((f, i) => (
          <li key={i} className="flex items-start gap-2">
            <RiCheckLine className="text-primary mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{f}</span>
          </li>
        ))}
      </ul>

      {tierRecords.length > 0 && (
        <div className="mb-4">
          <DrBadgeRow records={tierRecords} size="sm" />
        </div>
      )}

      <Button asChild variant={props.highlighted ? "default" : "outline"} className="w-full">
        <Link href={props.ctaHref}>{props.cta}</Link>
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
            {props.features.map((f, i) => (
              <li key={i} className="flex items-start gap-2">
                <RiCheckLine className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-400" />
                <span className="text-background/90">{f}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs font-medium text-amber-400">{props.limit}</p>
        </div>
        <div className="border-background/20 sm:border-l sm:pl-8 lg:min-w-[240px]">
          <div className="mb-4 flex items-baseline gap-1">
            <span className="font-editorial text-4xl font-semibold tabular-nums">
              {props.price}
            </span>
            <span className="text-background/70 text-sm">{props.priceSuffix}</span>
          </div>
          <Button
            size="lg"
            className="w-full bg-amber-400 text-zinc-950 hover:bg-amber-300"
            asChild
          >
            <Link href="#contact">{props.cta}</Link>
          </Button>
        </div>
      </div>
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
