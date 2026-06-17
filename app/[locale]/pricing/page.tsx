import type { Metadata } from "next"
import Link from "next/link"

import {
  RiArrowRightUpLine,
  RiCheckLine,
  RiCloseLine,
  RiLineChartLine,
  RiSearchEyeLine,
  RiShieldStarLine,
  RiSparkling2Line,
  RiStarFill,
} from "@remixicon/react"
import { getTranslations, setRequestLocale } from "next-intl/server"

import { DIRECTORY_PROMO } from "@/lib/directory-tiers"
import { getDRBatch, type DRRecord } from "@/lib/dr"
import { buildLocaleAlternates, buildLocaleOpenGraph } from "@/lib/i18n-metadata"
import {
  AUTHORITY_NETWORK,
  AUTHORITY_NETWORK_DOMAINS,
  DIRECTORY_NETWORK,
  DIRECTORY_NETWORK_DOMAINS,
} from "@/lib/site-network"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DrBadge } from "@/components/dr/dr-badge"
import { CopyPromoCode } from "@/components/pricing/copy-promo-code"
import { NetworkWall } from "@/components/pricing/network-wall"

// ISR: per-locale cache, hourly regen (DR is 3-day cached anyway).
// Never `force-static` — that would serve one default-locale render to
// every locale. Copy is fully translated via the `pricing` namespace.
export const revalidate = 3600

// ─── Language-neutral structure. All display copy lives in the
//     `pricing` i18n namespace (8 locales); only data that never needs
//     translating stays here: tier ids/prices, comparison values,
//     outcome icons, FAQ key order. ───
interface TierDef {
  id: "basic" | "plus" | "pro" | "ultra" | "ultraPlus"
  name: string
  price: string
  original: string | null
  recommended: boolean
  hasBadge: boolean
}

const TIERS: TierDef[] = [
  {
    id: "basic",
    name: "Basic",
    price: "$3.99",
    original: null,
    recommended: false,
    hasBadge: false,
  },
  {
    id: "plus",
    name: "Plus",
    price: "$6.99",
    original: "$9.99",
    recommended: false,
    hasBadge: false,
  },
  {
    id: "pro",
    name: "Pro",
    price: "$15.99",
    original: "$39.99",
    recommended: true,
    hasBadge: true,
  },
  {
    id: "ultra",
    name: "Ultra",
    price: "$19.99",
    original: null,
    recommended: false,
    hasBadge: true,
  },
  {
    id: "ultraPlus",
    name: "Ultra Plus",
    price: "$25.99",
    original: null,
    recommended: false,
    hasBadge: false,
  },
]

const OUTCOMES: { icon: React.ComponentType<{ className?: string }>; key: string }[] = [
  { icon: RiLineChartLine, key: "traffic" },
  { icon: RiShieldStarLine, key: "dr" },
  { icon: RiSearchEyeLine, key: "indexing" },
  { icon: RiSparkling2Line, key: "ai" },
]

const FAQ_KEYS = [
  "twoNetworks",
  "geo",
  "directoryPublish",
  "geoArticles",
  "oneTime",
  "retention",
  "upgrade",
  "refund",
  "multiple",
] as const

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: "pricing.metadata" })
  const path = "/pricing"
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

export default async function PricingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations("pricing")
  // Site-network data (taglines / topics) only ships en + zh; fall back
  // to en for the other locales.
  const dataLang: "en" | "zh" = locale.startsWith("zh") ? "zh" : "en"

  const drRecords = await getDRBatch([...DIRECTORY_NETWORK_DOMAINS, ...AUTHORITY_NETWORK_DOMAINS])
  const drByDomain = new Map(drRecords.map((r) => [r.domain, r]))

  // Directory domains currently at DR ≥ 35 — drives the "all (N)" and
  // Plus cells in the comparison table so they track live DR.
  const dr35Count = DIRECTORY_NETWORK_DOMAINS.filter(
    (d) => (drByDomain.get(d)?.dr ?? 0) >= 35,
  ).length
  const allDr35 = t("compare.allWithCount", { n: dr35Count })
  const plusDr35 = String(Math.min(5, dr35Count))

  // Comparison matrix — values align positionally with TIERS. Booleans
  // render as check/cross; strings render as-is; the localized
  // delivery/billing cells are resolved from the namespace.
  const compGroups: { title: string; rows: { label: string; values: (string | boolean)[] }[] }[] = [
    {
      title: t("compare.groups.directory"),
      rows: [
        { label: t("compare.rows.sites"), values: ["1", "5", "13", "13", "13"] },
        { label: t("compare.rows.dr35"), values: ["—", plusDr35, allDr35, allDr35, allDr35] },
        { label: t("compare.rows.dofollow"), values: [true, true, true, true, true] },
        { label: t("compare.rows.skipQueue"), values: [true, true, true, true, true] },
        { label: t("compare.rows.multiLang"), values: [false, false, true, true, true] },
      ],
    },
    {
      title: t("compare.groups.authority"),
      rows: [
        { label: t("compare.rows.articles"), values: ["—", "—", "—", "3", "6"] },
        { label: t("compare.rows.cited"), values: [false, false, false, true, true] },
      ],
    },
    {
      title: t("compare.groups.delivery"),
      rows: [
        {
          label: t("compare.rows.delivery"),
          values: [
            t("compare.values.auto1d"),
            t("compare.values.auto13d"),
            t("compare.values.auto13d"),
            t("compare.values.autoEditorial"),
            t("compare.values.autoEditorial"),
          ],
        },
        {
          label: t("compare.rows.billing"),
          values: Array(5).fill(t("compare.values.oneTime")),
        },
      ],
    },
  ]

  return (
    <main className="bg-background min-h-screen">
      <div className="mx-auto max-w-7xl px-4 pt-14 pb-24 sm:pt-20">
        {/* ─── Tight hero ─── */}
        <section className="mx-auto mb-12 max-w-2xl text-center sm:mb-14">
          <Badge
            variant="outline"
            className="bg-primary/5 text-primary border-primary/20 mb-4 font-mono text-[11px] tracking-wider uppercase"
          >
            {t("hero.badge")}
          </Badge>
          <h1 className="font-editorial text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            {t("hero.heading")}
          </h1>
          <p className="text-muted-foreground mx-auto mt-4 max-w-xl text-base leading-relaxed text-pretty sm:text-lg">
            {t("hero.subheading")}
          </p>
        </section>

        {/* ─── Scrolling chips wall — sits right above the price cards ─── */}
        <section className="mb-12">
          <NetworkWall
            lang={dataLang}
            records={drRecords}
            dirLabel={t("wall.directoryLabel")}
            authLabel={t("wall.authorityLabel")}
          />
        </section>

        {/* ─── Centerpiece: 5 tier cards in one responsive row ─── */}
        <section className="mb-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {TIERS.map((tier) => (
              <TierCard
                key={tier.id}
                name={tier.name}
                price={tier.price}
                original={tier.original}
                recommended={tier.recommended}
                badge={tier.hasBadge ? t(`tiers.${tier.id}.badge`) : null}
                blurb={t(`tiers.${tier.id}.blurb`)}
                features={t.raw(`tiers.${tier.id}.features`) as string[]}
                cta={t(`tiers.${tier.id}.cta`)}
                oneTimeLabel={t("oneTime")}
              />
            ))}
          </div>
          <p className="text-muted-foreground/80 mt-4 text-center text-xs">{t("pricingSub")}</p>
          <p className="mx-auto mt-2 max-w-xl text-center text-xs text-amber-700 dark:text-amber-400">
            {t("lockInNote")}
          </p>
        </section>

        {/* ─── Promo banner ─── */}
        {DIRECTORY_PROMO.enabled && (
          <section className="mt-8 mb-16">
            <div className="border-primary/30 bg-primary/[0.04] flex flex-col items-center justify-between gap-3 rounded-xl border px-5 py-4 sm:flex-row">
              <div className="text-center sm:text-left">
                <p className="text-primary font-mono text-[11px] tracking-wider uppercase">
                  {t("promo.label")}
                </p>
                <p className="text-foreground mt-0.5 text-sm font-medium">
                  {t("promo.headline")} · {t("promo.warning")}
                </p>
              </div>
              <CopyPromoCode
                code={DIRECTORY_PROMO.code}
                copyLabel={t("promo.copy")}
                copiedLabel={t("promo.copied")}
              />
            </div>
          </section>
        )}

        {/* ─── Primary content: full-width comparison table ─── */}
        <section className="mb-20">
          <div className="mb-6 text-center">
            <h2 className="font-editorial text-2xl font-semibold tracking-tight sm:text-3xl">
              {t("compare.title")}
            </h2>
            <p className="text-muted-foreground mx-auto mt-2 max-w-xl text-sm">
              {t("compare.sub")}
            </p>
          </div>

          <div className="overflow-x-auto rounded-2xl border">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <thead>
                <tr className="border-b">
                  <th className="bg-muted/30 w-[26%] px-5 py-4 text-left align-bottom">
                    <span className="text-muted-foreground font-mono text-[11px] tracking-wider uppercase">
                      {t("compare.planLabel")}
                    </span>
                  </th>
                  {TIERS.map((tier) => (
                    <th
                      key={tier.id}
                      className={`px-4 py-4 text-left align-bottom ${
                        tier.recommended ? "bg-primary/5" : "bg-muted/30"
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="font-editorial text-base font-semibold tracking-tight">
                          {tier.name}
                        </span>
                        {tier.recommended && <RiStarFill className="text-primary h-3.5 w-3.5" />}
                      </div>
                      <div className="mt-1 flex items-baseline gap-1.5">
                        <span className="font-editorial text-xl font-semibold tabular-nums">
                          {tier.price}
                        </span>
                        {tier.original && (
                          <span className="text-muted-foreground text-[11px] tabular-nums line-through">
                            {tier.original}
                          </span>
                        )}
                      </div>
                      <span className="text-muted-foreground/80 font-mono text-[10px] tracking-wide">
                        {t("oneTime")}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {compGroups.map((group) => (
                  <CompGroup key={group.title} group={group} />
                ))}

                {/* CTA row */}
                <tr className="border-t">
                  <td className="bg-muted/20 px-5 py-4" />
                  {TIERS.map((tier) => (
                    <td
                      key={tier.id}
                      className={`px-4 py-4 ${tier.recommended ? "bg-primary/5" : ""}`}
                    >
                      <Button
                        asChild
                        size="sm"
                        variant={tier.recommended ? "default" : "outline"}
                        className="w-full"
                      >
                        <Link href="/dashboard">{t(`tiers.${tier.id}.cta`)}</Link>
                      </Button>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* ─── Supporting evidence: the two networks (compact) ─── */}
        <section className="mb-20">
          <div className="mb-7 text-center">
            <h2 className="font-editorial text-2xl font-semibold tracking-tight sm:text-3xl">
              {t("evidence.title")}
            </h2>
            <p className="text-muted-foreground mx-auto mt-2 max-w-xl text-sm">
              {t("evidence.sub")}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {/* Directory — brand chips with inline DR badges */}
            <div className="bg-card flex flex-col rounded-2xl border p-6">
              <p className="text-primary font-mono text-[11px] tracking-wider uppercase">
                {t("networks.directory.eyebrow")}
              </p>
              <h3 className="font-editorial mt-1.5 text-lg font-semibold tracking-tight">
                {t("networks.directory.title")}
              </h3>
              <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                {t("networks.directory.desc")}
              </p>
              <div className="mt-5 flex flex-wrap gap-1.5">
                {DIRECTORY_NETWORK.map((site) => {
                  const record: DRRecord = drByDomain.get(site.domain) ?? {
                    domain: site.domain,
                    dr: null,
                    fetchedAt: null,
                    isFresh: false,
                  }
                  return (
                    <Link
                      key={site.domain}
                      href={site.href}
                      target="_blank"
                      rel="noopener"
                      className="border-border/70 hover:border-primary/40 hover:bg-primary/[0.03] inline-flex items-center gap-2 rounded-full border py-1 pr-1 pl-2.5 transition-colors"
                      title={site.tagline[dataLang]}
                    >
                      <span className="text-xs font-medium">{site.brand}</span>
                      <DrBadge record={record} size="sm" />
                    </Link>
                  )
                })}
              </div>
            </div>

            {/* Authority — domain · topic chips */}
            <div className="bg-card flex flex-col rounded-2xl border p-6">
              <p className="font-mono text-[11px] tracking-wider text-violet-600 uppercase dark:text-violet-300">
                {t("networks.authority.eyebrow")}
              </p>
              <h3 className="font-editorial mt-1.5 text-lg font-semibold tracking-tight">
                {t("networks.authority.title")}
              </h3>
              <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                {t("networks.authority.desc")}
              </p>
              <div className="mt-5 flex flex-wrap gap-1.5">
                {AUTHORITY_NETWORK.map((site) => (
                  <Link
                    key={site.domain}
                    href={site.href}
                    target="_blank"
                    rel="noopener"
                    className="border-border/70 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 transition-colors hover:border-violet-300 dark:hover:border-violet-900/70"
                  >
                    <span className="font-mono text-[11px] font-medium">{site.domain}</span>
                    <span className="text-muted-foreground text-[11px]">·</span>
                    <span className="text-muted-foreground text-[11px]">
                      {site.topic[dataLang]}
                    </span>
                    <RiArrowRightUpLine className="text-muted-foreground/50 h-3 w-3" />
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ─── Why it works — four outcomes ─── */}
        <section className="mb-20">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {OUTCOMES.map((o) => (
              <div key={o.key} className="bg-card rounded-2xl border p-5">
                <div className="bg-primary/10 text-primary mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg">
                  <o.icon className="h-5 w-5" />
                </div>
                <p className="font-editorial text-sm font-semibold tracking-tight">
                  {t(`outcomes.${o.key}.title`)}
                </p>
                <p className="text-muted-foreground mt-1.5 text-xs leading-relaxed">
                  {t(`outcomes.${o.key}.desc`)}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ─── FAQ ─── */}
        <section className="mx-auto mb-16 max-w-3xl">
          <h2 className="font-editorial mb-5 text-center text-2xl font-semibold tracking-tight sm:text-3xl">
            {t("faq.title")}
          </h2>
          <Accordion type="single" collapsible className="bg-card rounded-2xl border px-5">
            {FAQ_KEYS.map((key) => (
              <AccordionItem key={key} value={key}>
                <AccordionTrigger className="text-left text-base font-medium">
                  {t(`faq.${key}.q`)}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground text-sm leading-relaxed">
                  {t(`faq.${key}.a`)}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>

        {/* ─── Solution entry — links to the long-form /solution page ─── */}
        <section className="mb-12">
          <Link
            href="/solution"
            className="group bg-card hover:border-primary/50 flex flex-col items-start justify-between gap-4 rounded-2xl border p-6 transition-colors sm:flex-row sm:items-center sm:p-8"
          >
            <div>
              <p className="text-primary font-mono text-[11px] tracking-wider uppercase">
                {t("solutionCta.eyebrow")}
              </p>
              <h2 className="font-editorial mt-1.5 text-xl font-semibold tracking-tight sm:text-2xl">
                {t("solutionCta.heading")}
              </h2>
              <p className="text-muted-foreground mt-2 max-w-xl text-sm">{t("solutionCta.body")}</p>
            </div>
            <span className="text-primary inline-flex flex-shrink-0 items-center gap-1.5 text-sm font-medium">
              {t("solutionCta.cta")}
              <RiArrowRightUpLine className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </span>
          </Link>
        </section>

        {/* ─── Footer CTA ─── */}
        <section className="from-primary/10 via-primary/[0.04] border-primary/20 rounded-2xl border bg-gradient-to-br to-transparent p-8 text-center sm:p-12">
          <h2 className="font-editorial text-2xl font-semibold tracking-tight sm:text-3xl">
            {t("footer.heading")}
          </h2>
          <p className="text-muted-foreground mx-auto mt-3 mb-6 max-w-xl text-sm sm:text-base">
            {t("footer.body")}
          </p>
          <Button size="lg" asChild>
            <Link href="/dashboard">{t("footer.cta")}</Link>
          </Button>
        </section>
      </div>
    </main>
  )
}

// ─── Inline components ───

function TierCard({
  name,
  price,
  original,
  recommended,
  badge,
  blurb,
  features,
  cta,
  oneTimeLabel,
}: {
  name: string
  price: string
  original: string | null
  recommended: boolean
  badge: string | null
  blurb: string
  features: string[]
  cta: string
  oneTimeLabel: string
}) {
  return (
    <div
      className={`bg-card relative flex flex-col rounded-2xl border p-5 transition-shadow ${
        recommended
          ? "border-primary ring-primary/15 shadow-sm ring-2 xl:scale-[1.03]"
          : "hover:border-border"
      }`}
    >
      {badge && (
        <Badge
          className={`absolute -top-2.5 left-5 ${
            recommended ? "bg-primary text-primary-foreground" : "bg-foreground text-background"
          }`}
        >
          {badge}
        </Badge>
      )}

      <div className="mb-3">
        <span className="font-editorial text-lg font-semibold tracking-tight">{name}</span>
        <p className="text-muted-foreground mt-1 text-xs leading-snug">{blurb}</p>
      </div>

      <div className="mb-1 flex items-baseline gap-1.5">
        <span className="font-editorial text-3xl font-semibold tabular-nums">{price}</span>
        {original && (
          <span className="text-muted-foreground text-xs tabular-nums line-through">
            {original}
          </span>
        )}
      </div>
      <p className="text-muted-foreground/70 mb-4 font-mono text-[10px] tracking-wide uppercase">
        {oneTimeLabel}
      </p>

      <ul className="mb-5 space-y-2 text-xs">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-1.5">
            <RiCheckLine className="text-primary mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            <span className="text-foreground/80 leading-snug">{f}</span>
          </li>
        ))}
      </ul>

      <Button
        asChild
        variant={recommended ? "default" : "outline"}
        size="sm"
        className="mt-auto w-full"
      >
        <Link href="/dashboard">{cta}</Link>
      </Button>
    </div>
  )
}

function CompGroup({
  group,
}: {
  group: { title: string; rows: { label: string; values: (string | boolean)[] }[] }
}) {
  return (
    <>
      <tr className="border-t">
        <td
          colSpan={6}
          className="bg-muted/40 text-muted-foreground px-5 py-2 font-mono text-[11px] font-medium tracking-wider uppercase"
        >
          {group.title}
        </td>
      </tr>
      {group.rows.map((row) => (
        <tr key={row.label} className="border-border/60 border-t">
          <th className="px-5 py-3 text-left align-top font-medium">
            <span className="text-foreground/90">{row.label}</span>
          </th>
          {row.values.map((v, i) => {
            const recommended = i === 2
            return (
              <td
                key={i}
                className={`px-4 py-3 align-top ${recommended ? "bg-primary/5 font-medium" : ""}`}
              >
                <CompCell value={v} recommended={recommended} />
              </td>
            )
          })}
        </tr>
      ))}
    </>
  )
}

function CompCell({ value, recommended }: { value: string | boolean; recommended: boolean }) {
  if (typeof value === "boolean") {
    return value ? (
      <RiCheckLine
        className={`h-4 w-4 ${recommended ? "text-primary" : "text-emerald-600 dark:text-emerald-400"}`}
      />
    ) : (
      <RiCloseLine className="text-muted-foreground/40 h-4 w-4" />
    )
  }
  if (value === "—") {
    return <span className="text-muted-foreground/40">—</span>
  }
  return (
    <span className={`tabular-nums ${recommended ? "" : "text-muted-foreground"}`}>{value}</span>
  )
}
