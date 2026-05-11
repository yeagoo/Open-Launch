import type { Metadata } from "next"
import { headers } from "next/headers"
import Image from "next/image"

import { Link } from "@/i18n/navigation"
import { getTranslations, setRequestLocale } from "next-intl/server"

import { auth } from "@/lib/auth"
import { localizeProjectDescriptionGroups } from "@/lib/get-project-translation"
import { buildLocaleAlternates } from "@/lib/i18n-metadata"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { DenseList } from "@/components/home/dense-list"
import { EditorialHero } from "@/components/home/editorial-hero"
import { SidebarSponsors } from "@/components/layout/sidebar-sponsors"
import { ItemListSchema } from "@/components/seo/structured-data"
import { getMonthBestProjects, getTodayProjects, getYesterdayProjects } from "@/app/actions/home"
import { getTopCategories } from "@/app/actions/projects"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  return { alternates: buildLocaleAlternates("/", locale) }
}

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)

  const t = await getTranslations("home")
  const tSections = await getTranslations("home.sections")
  const tCommon = await getTranslations("common")

  // 4 reads in parallel. The 3 listing calls are wrapped in
  // `unstable_cache` so the bulk of the work is cached; the
  // user-upvotes augmentation inside each runs per request.
  const [todayRaw, yesterdayRaw, monthRaw, topCategories] = await Promise.all([
    getTodayProjects(),
    getYesterdayProjects(),
    getMonthBestProjects(),
    getTopCategories(5),
  ])
  // Single DB round-trip for translations across all 3 lists —
  // previously this was 3 separate `localizeProjectDescriptions`
  // calls (3 extra round-trips per home render).
  const [todayProjects, yesterdayProjects, monthProjects] = await localizeProjectDescriptionGroups(
    [todayRaw, yesterdayRaw, monthRaw],
    locale,
  )

  const session = await auth.api.getSession({
    headers: await headers(),
  })

  const itemListData = todayProjects.map((p) => ({
    name: p.name,
    slug: p.slug,
    logoUrl: p.logoUrl,
  }))

  return (
    <main className="bg-muted/30 min-h-screen">
      {itemListData.length > 0 && (
        <ItemListSchema
          name={t("metadata.today")}
          description={t("metadata.todayDesc")}
          items={itemListData}
          listType="project"
        />
      )}
      <div className="container mx-auto max-w-6xl px-4 pt-6 pb-12 md:pt-8">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-3 lg:items-start">
          <div className="space-y-6 sm:space-y-8 lg:col-span-2">
            {/* Welcome */}
            <div className="bg-secondary/70 hover:bg-secondary border-border/40 relative z-10 overflow-hidden rounded-lg border">
              <div className="container mx-auto max-w-6xl px-4 py-3 md:py-4">
                <div className="flex flex-col items-center justify-center gap-3 md:hidden">
                  <Link href="/pricing" className="flex cursor-pointer flex-col gap-2 text-center">
                    <div>
                      <h1 className="text-foreground text-base font-semibold">
                        <span>{t("banner.title")}</span>
                      </h1>
                      <p className="text-muted-foreground text-xs">
                        <span>{t("banner.subtitle")}</span>
                      </p>
                    </div>
                  </Link>
                </div>

                {/* Desktop-only banner with mascot pair. The oppie
                    images are decorative (the banner text is the real
                    content) so no `priority` — preload hints on
                    decorative imagery just push real content lower in
                    the priority queue. Mobile users don't see these
                    at all (`hidden md:flex`), so a preload hint
                    would have been wasted there. */}
                <div className="hidden items-center justify-center gap-12 md:flex">
                  <div className="flex-shrink-0">
                    <Image
                      src="/oppieG.png"
                      alt=""
                      width={96}
                      height={96}
                      className="h-24 w-24 object-contain"
                    />
                  </div>
                  <div className="flex flex-col items-center justify-center gap-4 text-center">
                    <Link href="/pricing" className="cursor-pointer">
                      <h1 className="text-foreground text-lg font-semibold">
                        <span>{t("banner.title")}</span>
                      </h1>
                      <p className="text-muted-foreground text-sm">
                        <span>{t("banner.subtitle")}</span>
                      </p>
                    </Link>
                  </div>

                  <div className="flex-shrink-0">
                    <Image
                      src="/oppieD.png"
                      alt=""
                      width={96}
                      height={96}
                      className="h-24 w-24 object-contain"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Today's reads — hero (top 3) + dense list for the rest. */}
            {(() => {
              const sortedToday = [...todayProjects].sort(
                (a, b) => (b.upvoteCount ?? 0) - (a.upvoteCount ?? 0),
              )
              const heroToday = sortedToday.slice(0, 3)
              const restToday = sortedToday.slice(3)
              // Zeabur's Node image ships with reduced ICU data, so calling
              // toLocaleDateString with non-English locales (et / ko / etc.)
              // throws "Incorrect locale information provided". Try the
              // user's locale, fall back to en-US if Node rejects it; if
              // even that fails, drop the kicker entirely rather than 500
              // the home page.
              let todayKicker: string | undefined
              try {
                todayKicker = new Date().toLocaleDateString(
                  [locale === "en" ? "en-US" : locale, "en-US"],
                  { weekday: "long", month: "short", day: "numeric" },
                )
              } catch {
                todayKicker = undefined
              }
              return (
                <>
                  <EditorialHero
                    projects={heroToday}
                    heading={tSections("todayTitle")}
                    kicker={todayKicker}
                  />
                  {restToday.length > 0 && (
                    // Continuation of the hero — no heading bar, ranks
                    // pick up at 04 so the numbering stays consistent.
                    <DenseList projects={restToday} startRank={4} />
                  )}
                </>
              )
            })()}

            <DenseList
              projects={[...yesterdayProjects].sort(
                (a, b) => (b.upvoteCount ?? 0) - (a.upvoteCount ?? 0),
              )}
              heading={tSections("yesterdayTitle")}
              moreHref="/trending?filter=yesterday"
              moreLabel={tCommon("viewAll")}
            />

            <DenseList
              projects={[...monthProjects].sort(
                (a, b) => (b.upvoteCount ?? 0) - (a.upvoteCount ?? 0),
              )}
              heading={tSections("monthTitle")}
              moreHref="/trending?filter=month"
              moreLabel={tCommon("viewAll")}
            />
          </div>

          {/* Sidebar */}
          <div className="top-24">
            <SidebarSponsors />

            <div className="py-4">
              {/* Sidebar promo image — below the fold (sponsor block
                  + categories sit above it on lg screens), so no
                  `priority`. `sizes` lets next/image pick the right
                  variant for the ~320px sidebar column. */}
              <Image
                src="/images/img1.png"
                alt="build for joy"
                width={960}
                height={540}
                sizes="(max-width: 1024px) 100vw, 320px"
                className="h-auto w-full rounded-lg"
              />
            </div>

            {/* Categories */}
            <div className="space-y-3 py-4">
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-2 font-semibold">
                  {tSections("topCategories")}
                </h3>
                <Button variant="ghost" size="sm" className="text-sm" asChild>
                  <Link href="/categories" className="flex items-center gap-1">
                    {tCommon("viewAll")}
                  </Link>
                </Button>
              </div>
              <div className="space-y-2">
                {topCategories.map((category) => (
                  <Link
                    key={category.id}
                    href={`/categories?category=${category.id}`}
                    className={cn(
                      "-mx-2 flex items-center justify-between rounded-md p-2",
                      category.id === "all" ? "bg-muted font-medium" : "hover:bg-muted/40",
                    )}
                  >
                    <span className="text-sm">{category.name}</span>
                    <span className="text-muted-foreground bg-secondary rounded-full px-2 py-0.5 text-xs">
                      {tSections("projectsCount", { count: category.count })}
                    </span>
                  </Link>
                ))}
              </div>
            </div>

            {/* Quick Links */}
            <div className="space-y-3 py-4">
              <h3 className="flex items-center gap-2 font-semibold">{tSections("quickAccess")}</h3>
              <div className="space-y-2">
                {session?.user && (
                  <Link
                    href="/dashboard"
                    className="-mx-2 flex items-center gap-2 rounded-md p-2 text-sm transition-colors hover:underline"
                  >
                    {tSections("dashboard")}
                  </Link>
                )}
                <Link
                  href="/trending"
                  className="-mx-2 flex items-center gap-2 rounded-md p-2 text-sm transition-colors hover:underline"
                >
                  {tSections("trendingNow")}
                </Link>
                <Link
                  href="/winners"
                  className="-mx-2 flex items-center gap-2 rounded-md p-2 text-sm transition-colors hover:underline"
                >
                  {tSections("dailyWinners")}
                </Link>
                <Link
                  href="/trending?filter=month"
                  className="-mx-2 flex items-center gap-2 rounded-md p-2 text-sm transition-colors hover:underline"
                >
                  {tSections("bestOfMonth")}
                </Link>
              </div>
            </div>

            {/* Linux Docs Alliance */}
            <div className="space-y-3 py-4">
              <h3 className="flex items-center gap-2 font-semibold">
                {tSections("linuxAlliance")}
              </h3>
              <div className="space-y-2">
                <a
                  href="https://debian.club/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="-mx-2 flex items-center gap-2 rounded-md p-2 text-sm transition-colors hover:underline"
                >
                  Debian.Club
                </a>
                <a
                  href="https://ubuntu.fan/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="-mx-2 flex items-center gap-2 rounded-md p-2 text-sm transition-colors hover:underline"
                >
                  Ubuntu.Fan
                </a>
                <a
                  href="https://runentlinux.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="-mx-2 flex items-center gap-2 rounded-md p-2 text-sm transition-colors hover:underline"
                >
                  RunEntLinux
                </a>
                <a
                  href="https://www.almalinux.com.cn/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="-mx-2 flex items-center gap-2 rounded-md p-2 text-sm transition-colors hover:underline"
                >
                  AlmaLinuxCN
                </a>
              </div>
              <p className="text-muted-foreground text-xs">
                {tSections("linuxAllianceFooter")}
                <a
                  href="https://eol.wiki/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary ml-1 hover:underline"
                >
                  EOL.Wiki
                </a>
              </p>
            </div>

            {/* Recommended */}
            <div className="space-y-3 py-4">
              <h3 className="flex items-center gap-2 font-semibold">{tSections("recommended")}</h3>
              <div className="space-y-2">
                <a
                  href="https://web.casa"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:bg-muted/40 -mx-2 block rounded-md p-2 transition-colors"
                >
                  <span className="text-sm font-medium">WebCasa</span>
                  <span className="text-muted-foreground block text-xs">
                    {tSections("webcasaDesc")}
                  </span>
                </a>
                <a
                  href="https://litehttpd.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:bg-muted/40 -mx-2 block rounded-md p-2 transition-colors"
                >
                  <span className="text-sm font-medium">LiteHTTPD</span>
                  <span className="text-muted-foreground block text-xs">
                    {tSections("litehttpdDesc")}
                  </span>
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
