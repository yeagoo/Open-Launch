/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next"
import Link from "next/link"

import { db } from "@/drizzle/db"
import { seoArticle } from "@/drizzle/db/schema"
import {
  RiArrowRightLine,
  RiArticleLine,
  RiCheckLine,
  RiInformationLine,
  RiLinkM,
  RiRocketLine,
  RiSparkling2Line,
  RiStarLine,
} from "@remixicon/react"
import { desc } from "drizzle-orm"
import { Calendar, Clock } from "lucide-react"
import { getTranslations, setRequestLocale } from "next-intl/server"

import { LAUNCH_LIMITS, LAUNCH_SETTINGS, SEO_ARTICLE_PAYMENT_LINK } from "@/lib/constants"
import {
  DIRECTORY_PROMO,
  DIRECTORY_TIER_CONFIG,
  DIRECTORY_TIERS,
  type DirectoryTier,
} from "@/lib/directory-tiers"
import { buildLocaleAlternates, buildLocaleOpenGraph } from "@/lib/i18n-metadata"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { CopyPromoCode } from "@/components/pricing/copy-promo-code"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: "metadata.pricing" })
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
    twitter: {
      card: "summary_large_image",
      site: "@aat_ee",
      creator: "@aat_ee",
      title: t("title"),
      description: t("description"),
    },
  }
}

function formatDate(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date)
}

function calculateReadingTime(content: string): string {
  const wordsPerMinute = 200
  const words = content.split(/\s+/).length
  const minutes = Math.ceil(words / wordsPerMinute)
  return `${minutes} min read`
}

async function getLatestReviews() {
  const reviews = await db.select().from(seoArticle).orderBy(desc(seoArticle.publishedAt)).limit(5)

  return reviews.map((review) => ({
    ...review,
    readingTime: calculateReadingTime(review.content),
  }))
}

// Icon per directory tier — keeps the 4 paid cards visually
// distinct from each other and from the Free card. Defined outside
// the component so each tier always gets the same icon.
const TIER_ICON: Record<DirectoryTier, typeof RiCheckLine> = {
  basic: RiCheckLine,
  plus: RiRocketLine,
  pro: RiSparkling2Line,
  ultra: RiStarLine,
}

export default async function PricingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)

  const t = await getTranslations("pricing.hub")
  const tDir = await getTranslations("pricingDirectories")
  const latestReviews = await getLatestReviews()

  return (
    <main className="bg-background min-h-screen">
      <div className="mx-auto max-w-5xl px-4 py-12 sm:py-16">
        {/* ─── Hero ─── */}
        <section className="mb-10 text-center sm:mb-14">
          <Badge
            variant="outline"
            className="bg-primary/5 text-primary border-primary/20 mb-4 font-mono text-[11px] tracking-wider uppercase"
          >
            {t("kicker")}
          </Badge>
          <h1 className="font-editorial mb-4 text-3xl font-semibold tracking-tight sm:text-4xl">
            {t("heading")}
          </h1>
          <p className="text-muted-foreground mx-auto max-w-2xl text-sm sm:text-base">
            {t("subheading")}
          </p>
        </section>

        {/* ─── Free starter card — separate row so the binary
            "free or paid" decision is visually obvious before the
            user starts comparing paid tiers. ─── */}
        <section className="mb-10">
          <div className="bg-card rounded-xl border p-6 sm:p-7">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto] sm:items-center">
              <div>
                <div className="mb-1 flex items-center gap-2">
                  <RiRocketLine className="text-muted-foreground h-4 w-4" />
                  <span className="font-editorial text-xl font-semibold tracking-tight">
                    {t("free.name")}
                  </span>
                  <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-emerald-700 ring-1 ring-emerald-500/20 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/20">
                    {t("free.billingNote")}
                  </span>
                </div>
                <p className="text-muted-foreground mb-4 text-sm">{t("free.tagline")}</p>
                <ul className="grid grid-cols-1 gap-1.5 text-sm sm:grid-cols-2">
                  <li className="flex items-start gap-2">
                    <RiCheckLine className="text-muted-foreground mt-0.5 h-4 w-4 flex-shrink-0" />
                    <span>{t("free.features.slots", { n: LAUNCH_LIMITS.FREE_DAILY_LIMIT })}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <RiCheckLine className="text-muted-foreground mt-0.5 h-4 w-4 flex-shrink-0" />
                    <span>
                      {t("free.features.schedule", { n: LAUNCH_SETTINGS.MAX_DAYS_AHEAD })}
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <RiCheckLine className="text-muted-foreground mt-0.5 h-4 w-4 flex-shrink-0" />
                    <span>{t("free.features.homepage")}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <RiCheckLine className="text-muted-foreground mt-0.5 h-4 w-4 flex-shrink-0" />
                    <span>{t("free.features.dofollow")}</span>
                  </li>
                </ul>
              </div>
              <div className="flex items-center justify-between gap-4 sm:flex-col sm:items-end sm:justify-center">
                <div className="font-editorial text-3xl font-semibold tabular-nums">
                  {t("free.price")}
                </div>
                <Button variant="outline" asChild className="w-full sm:w-auto">
                  <Link href="/projects/submit">{t("free.cta")}</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* ─── Boost section ─── */}
        <section className="mb-10">
          <div className="mb-5">
            <h2 className="font-editorial text-2xl font-semibold tracking-tight sm:text-3xl">
              {t("boostSectionHeading")}
            </h2>
            <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
              {t("boostSectionSubheading")}
            </p>
          </div>

          {/* Promo banner — same DIRECTORY_PROMO source-of-truth as
              the directory pricing page and the submit form. Flipping
              `enabled: false` in lib/directory-tiers hides it in all
              three places. */}
          {DIRECTORY_PROMO.enabled && (
            <div className="border-primary/30 from-primary/10 via-primary/5 mb-5 flex flex-col items-start justify-between gap-3 rounded-lg border bg-gradient-to-br to-transparent p-4 sm:flex-row sm:items-center">
              <div>
                <p className="text-primary mb-0.5 font-mono text-[10px] tracking-wider uppercase">
                  {tDir("promoCode.label")}
                </p>
                <p className="text-foreground text-sm font-semibold">
                  {tDir("promoCode.headline")}
                </p>
                <p className="text-muted-foreground text-xs">{tDir("promoCode.subtext")}</p>
              </div>
              <CopyPromoCode
                code={DIRECTORY_PROMO.code}
                copyLabel={tDir("promoCode.copy")}
                copiedLabel={tDir("promoCode.copied")}
              />
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {DIRECTORY_TIERS.map((tier) => {
              const cfg = DIRECTORY_TIER_CONFIG[tier]
              const Icon = TIER_ICON[tier]
              const isPopular = tier === "pro"
              const priceText = `$${(cfg.amountCents / 100).toFixed(2)}`
              const billingNote = cfg.isSubscription
                ? tDir("tiers.billing.subscription")
                : tDir("tiers.billing.oneOff")

              return (
                <div
                  key={tier}
                  // `id="ultra"` anchor target — the legacy /sponsors
                  // route 308-redirects to /pricing#ultra, so this is
                  // the row that needs to scroll into view.
                  id={tier === "ultra" ? "ultra" : undefined}
                  className={`bg-card relative flex scroll-mt-24 flex-col rounded-xl border p-5 ${
                    isPopular ? "border-primary ring-primary/20 ring-1" : ""
                  }`}
                >
                  {isPopular && (
                    <Badge
                      variant="default"
                      className="bg-primary text-primary-foreground absolute -top-2 left-4 text-[10px]"
                    >
                      {tDir("tiers.pro.badge")}
                    </Badge>
                  )}
                  <div className="mb-2 flex items-center gap-1.5">
                    <Icon className="text-primary h-4 w-4 flex-shrink-0" />
                    <span className="font-editorial text-lg font-semibold tracking-tight">
                      {tDir(`tiers.${tier}.name`)}
                    </span>
                  </div>
                  <p className="text-muted-foreground mb-3 text-xs">
                    {tDir(`tiers.${tier}.tagline`)}
                  </p>
                  <div className="mb-1 flex items-baseline gap-2">
                    <span className="font-editorial text-2xl font-semibold tabular-nums">
                      {priceText}
                    </span>
                    {cfg.isSubscription && (
                      <span className="text-muted-foreground text-xs">
                        {tDir("tiers.ultra.priceSuffix")}
                      </span>
                    )}
                  </div>
                  <div className="mb-4">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide ${
                        cfg.isSubscription
                          ? "bg-violet-500/10 text-violet-700 ring-1 ring-violet-500/20 dark:bg-violet-400/10 dark:text-violet-200 dark:ring-violet-400/20"
                          : "bg-emerald-500/10 text-emerald-700 ring-1 ring-emerald-500/20 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/20"
                      }`}
                    >
                      {billingNote}
                    </span>
                  </div>
                  <Button
                    asChild
                    variant={isPopular ? "default" : "outline"}
                    className="mt-auto w-full"
                  >
                    <Link href="/projects/submit">{tDir(`tiers.${tier}.cta`)}</Link>
                  </Button>
                </div>
              )
            })}
          </div>

          <p className="text-muted-foreground mt-4 text-center text-xs">
            {tDir("tiers.deliveryNote")}
          </p>
        </section>

        {/* ─── SEO Growth Package ─── */}
        <section className="mb-12">
          <div className="mb-5">
            <h2 className="font-editorial text-2xl font-semibold tracking-tight sm:text-3xl">
              {t("seoSectionHeading")}
            </h2>
            <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
              {t("seoSectionSubheading")}
            </p>
          </div>

          <div className="border-primary/20 bg-primary/5 rounded-xl border p-5 sm:p-6">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-[auto_1fr_auto] md:items-center">
              <div className="bg-primary/10 flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg">
                <RiArticleLine className="text-primary h-6 w-6" />
              </div>
              <div>
                <h3 className="mb-1 text-lg font-semibold">SEO Growth Package</h3>
                <p className="text-muted-foreground mb-3 text-sm">
                  Dedicated &ldquo;[your product] review&rdquo; article + Premium Launch + high-DR
                  dofollow backlink. We test, write, illustrate, and rank it.
                </p>
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-editorial text-2xl font-semibold tabular-nums">
                    ${LAUNCH_SETTINGS.ARTICLE_PRICE}
                  </span>
                  <span className="text-muted-foreground text-sm tabular-nums line-through">
                    $199
                  </span>
                </div>
              </div>
              <Dialog>
                <DialogTrigger asChild>
                  <Button className="w-full md:w-auto">Get SEO Growth Package</Button>
                </DialogTrigger>
                <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto sm:max-w-lg">
                  <DialogHeader className="pb-4">
                    <DialogTitle className="text-xl font-semibold">SEO Growth Package</DialogTitle>
                    <DialogDescription className="text-muted-foreground">
                      Complete SEO solution to rank on Google
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-5">
                    <div className="text-center">
                      <div className="text-3xl font-bold">
                        ${LAUNCH_SETTINGS.ARTICLE_PRICE}
                        <span className="text-muted-foreground ml-2 text-lg font-normal line-through">
                          $199
                        </span>
                      </div>
                    </div>

                    <div>
                      <h3 className="mb-3 text-sm font-medium">What you get:</h3>
                      <div className="space-y-2">
                        <div className="flex gap-3">
                          <div className="bg-primary/10 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded">
                            <RiArticleLine className="text-primary h-3 w-3" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-medium">Dedicated SEO article</div>
                            <div className="text-muted-foreground text-xs">
                              Custom &ldquo;[product] review&rdquo; content
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-3">
                          <div className="bg-primary/10 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded">
                            <RiLinkM className="text-primary h-3 w-3" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-medium">Premium Launch</div>
                            <div className="text-muted-foreground text-xs">
                              High-DR dofollow backlink included
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div>
                      <h3 className="mb-3 text-sm font-medium">What happens next:</h3>
                      <div className="space-y-2">
                        {[
                          "Pay & secure your slot",
                          "We contact you within 24h (product access, keywords, details)",
                          "Premium launch next day",
                          "SEO article published in 5–7 days",
                        ].map((step, i) => (
                          <div key={i} className="flex gap-3">
                            <div className="bg-primary flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-xs font-medium text-white">
                              {i + 1}
                            </div>
                            <div className="text-sm">{step}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="bg-muted/40 rounded p-3">
                      <div className="flex gap-2">
                        <RiInformationLine className="text-muted-foreground mt-0.5 h-4 w-4 flex-shrink-0" />
                        <div className="text-sm">
                          <span className="font-medium">Requirement:</span> Free product access for
                          testing
                        </div>
                      </div>
                    </div>

                    <Button className="h-11 w-full" asChild>
                      <Link href={SEO_ARTICLE_PAYMENT_LINK} target="_blank">
                        Get SEO Package — ${LAUNCH_SETTINGS.ARTICLE_PRICE}
                      </Link>
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </section>

        {/* ─── Comparison table ─── */}
        <section className="mb-12">
          <h2 className="font-editorial mb-5 text-2xl font-semibold tracking-tight sm:text-3xl">
            {t("comparison.heading")}
          </h2>
          <div className="bg-card overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="border-b">
                <tr className="text-left">
                  <th className="text-muted-foreground px-4 py-3 font-medium">
                    {t("comparison.tierColumn")}
                  </th>
                  <th className="px-4 py-3 font-medium">{t("comparison.free")}</th>
                  <th className="px-4 py-3 font-medium">{tDir("tiers.basic.name")}</th>
                  <th className="px-4 py-3 font-medium">{tDir("tiers.plus.name")}</th>
                  <th className="bg-primary/5 px-4 py-3 font-semibold">{tDir("tiers.pro.name")}</th>
                  <th className="px-4 py-3 font-medium">{tDir("tiers.ultra.name")}</th>
                </tr>
              </thead>
              <tbody className="divide-border/60 divide-y">
                <ComparisonRow
                  label={tDir("comparison.rows.sites")}
                  values={[
                    "aat.ee",
                    tDir("comparison.values.basicSites"),
                    tDir("comparison.values.plusSites"),
                    tDir("comparison.values.proSites"),
                    tDir("comparison.values.ultraSites"),
                  ]}
                />
                <ComparisonRow
                  label={tDir("comparison.rows.skipQueue")}
                  values={[false, true, true, true, true]}
                />
                <ComparisonRow
                  label={tDir("comparison.rows.dofollow")}
                  values={["conditional", true, true, true, true]}
                />
                <ComparisonRow
                  label={tDir("comparison.rows.docsLinks")}
                  values={[false, false, false, true, true]}
                />
                <ComparisonRow
                  label={tDir("comparison.rows.sidebarAd")}
                  values={[false, false, false, false, true]}
                />
                <ComparisonRow
                  label={tDir("comparison.rows.delivery")}
                  values={[
                    "—",
                    tDir("comparison.values.auto1d"),
                    tDir("comparison.values.manual3d"),
                    tDir("comparison.values.manual3d"),
                    tDir("comparison.values.manual3d"),
                  ]}
                />
                <ComparisonRow
                  label={tDir("comparison.rows.billing")}
                  values={[
                    "—",
                    tDir("comparison.values.oneOff"),
                    tDir("comparison.values.oneOff"),
                    tDir("comparison.values.oneOff"),
                    tDir("comparison.values.subscription"),
                  ]}
                />
              </tbody>
            </table>
          </div>
        </section>

        {/* ─── Latest reviews (SEO Growth Package examples) ─── */}
        {latestReviews.length > 0 && (
          <section className="mb-12">
            <div className="mb-6 text-center">
              <h2 className="font-editorial text-2xl font-semibold tracking-tight sm:text-3xl">
                Latest Reviews
              </h2>
              <p className="text-muted-foreground mt-1 text-sm">
                Examples of the SEO articles we&apos;ve written
              </p>
            </div>

            <div className="mx-auto max-w-4xl">
              <Carousel className="w-full">
                <CarouselContent className="-ml-2 md:-ml-4">
                  {latestReviews.map((review) => (
                    <CarouselItem key={review.slug} className="pl-2 md:basis-1/2 md:pl-4">
                      <article className="group">
                        <Link
                          href={`/reviews/${review.slug}`}
                          className="bg-card hover:border-muted-foreground/20 block overflow-hidden rounded-2xl border"
                        >
                          <div className="bg-muted relative aspect-[16/9] overflow-hidden">
                            {review.image ? (
                              <img
                                src={review.image}
                                alt={review.title}
                                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-103"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center">
                                <div className="text-muted-foreground/30 text-4xl font-bold">
                                  {review.title.charAt(0).toUpperCase()}
                                </div>
                              </div>
                            )}
                          </div>
                          <div className="px-5 py-4">
                            <div className="text-muted-foreground mb-2 flex items-center gap-4 text-xs">
                              <div className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                <time dateTime={review.publishedAt.toISOString()}>
                                  {formatDate(review.publishedAt, locale)}
                                </time>
                              </div>
                              <div className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                <span>{review.readingTime}</span>
                              </div>
                            </div>
                            <h3 className="text-card-foreground group-hover:text-primary mb-2 line-clamp-3 text-base font-semibold transition-colors">
                              {review.title}
                            </h3>
                            <p className="text-muted-foreground line-clamp-3 text-xs">
                              {review.description}
                            </p>
                          </div>
                        </Link>
                      </article>
                    </CarouselItem>
                  ))}
                </CarouselContent>
                <CarouselPrevious />
                <CarouselNext />
              </Carousel>
            </div>

            <div className="mt-6 text-center">
              <Link
                href="/reviews"
                className="text-primary hover:text-primary/80 text-sm font-medium"
              >
                View all reviews →
              </Link>
            </div>
          </section>
        )}

        {/* ─── FAQ (reuses the directory FAQ — same answers cover
            this hub since the paid tiers are the same product) ─── */}
        <section className="mb-12">
          <h2 className="font-editorial mb-5 text-2xl font-semibold tracking-tight sm:text-3xl">
            {t("faqHeading")}
          </h2>
          <Accordion type="single" collapsible className="bg-card rounded-xl border px-4">
            {(["discount", "delivery", "retention", "upgrade", "refund", "multiple"] as const).map(
              (key) => (
                <AccordionItem key={key} value={key}>
                  <AccordionTrigger className="text-left text-base font-medium">
                    {tDir(`faq.items.${key}.q`)}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground text-sm leading-relaxed">
                    {tDir(`faq.items.${key}.a`)}
                  </AccordionContent>
                </AccordionItem>
              ),
            )}
          </Accordion>
        </section>

        {/* ─── Footer CTA ─── */}
        <section className="bg-card rounded-xl border p-8 text-center sm:p-10">
          <h2 className="font-editorial mb-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            {t("footerHeading")}
          </h2>
          <p className="text-muted-foreground mx-auto mb-5 max-w-xl text-sm">{t("footerBody")}</p>
          <Button size="lg" asChild>
            <Link href="/projects/submit" className="inline-flex items-center gap-1.5">
              {t("footerCta")}
              <RiArrowRightLine className="h-4 w-4" />
            </Link>
          </Button>
        </section>
      </div>
    </main>
  )
}

function ComparisonRow({ label, values }: { label: string; values: (string | boolean)[] }) {
  return (
    <tr>
      <th className="text-muted-foreground px-4 py-3 text-left font-medium">{label}</th>
      {values.map((v, i) => (
        <td
          key={i}
          className={`px-4 py-3 ${i === 3 ? "bg-primary/5 font-medium" : "text-muted-foreground"}`}
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
