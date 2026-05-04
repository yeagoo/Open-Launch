/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next"
import { headers } from "next/headers"

import { Link } from "@/i18n/navigation"
import { getTranslations, setRequestLocale } from "next-intl/server"

import { auth } from "@/lib/auth"
import { buildLocaleAlternates } from "@/lib/i18n-metadata"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ProjectSection } from "@/components/home/project-section"
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

  const todayProjects = await getTodayProjects()
  const yesterdayProjects = await getYesterdayProjects()
  const monthProjects = await getMonthBestProjects()
  const topCategories = await getTopCategories(5)

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

                <div className="hidden items-center justify-center gap-12 md:flex">
                  <div className="flex-shrink-0">
                    <img
                      src="/oppieG.png"
                      alt="aat.ee Character"
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
                    <img
                      src="/oppieD.png"
                      alt="aat.ee Character"
                      className="h-24 w-24 object-contain"
                    />
                  </div>
                </div>
              </div>
            </div>

            <ProjectSection
              title={tSections("todayTitle")}
              projects={todayProjects}
              sortByUpvotes={true}
              isAuthenticated={!!session?.user}
            />

            <ProjectSection
              title={tSections("yesterdayTitle")}
              projects={yesterdayProjects}
              moreHref="/trending?filter=yesterday"
              sortByUpvotes={true}
              isAuthenticated={!!session?.user}
            />

            <ProjectSection
              title={tSections("monthTitle")}
              projects={monthProjects}
              moreHref="/trending?filter=month"
              sortByUpvotes={true}
              isAuthenticated={!!session?.user}
            />
          </div>

          {/* Sidebar */}
          <div className="top-24">
            <SidebarSponsors />

            <div className="py-4">
              <img src="/images/img1.png" alt="build for joy" className="w-full rounded-lg" />
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
