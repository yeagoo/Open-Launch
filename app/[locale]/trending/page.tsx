import { Suspense } from "react"
import type { Metadata } from "next"
import { headers } from "next/headers"
import Link from "next/link"

import { getLocale, getTranslations } from "next-intl/server"

import { auth } from "@/lib/auth"
import { PROJECT_LIMITS_VARIABLES } from "@/lib/constants"
import { localizeProjectDescriptions } from "@/lib/get-project-translation"
import { buildLocaleAlternates, buildLocaleOpenGraph } from "@/lib/i18n-metadata"
import { Button } from "@/components/ui/button"
import { SerifHeading } from "@/components/ds/serif-heading"
// import { RiFilterLine, RiArrowDownSLine } from "@remixicon/react";
import { ProjectCardButtons } from "@/components/home/project-card-buttons"
import { RankedRow } from "@/components/home/v2/ranked-row"
import { ItemListSchema } from "@/components/seo/structured-data"
import { getMonthBestProjects, getTodayProjects, getYesterdayProjects } from "@/app/actions/home"
import { getTopCategories } from "@/app/actions/projects"

interface ProjectSummary {
  id: string
  slug: string
  name: string
  description: string | null
  logoUrl: string
  websiteUrl?: string | null
  upvoteCount: number
  commentCount?: number | null
  launchStatus: string
  scheduledLaunchDate?: Date | string | null
  createdAt: Date | string
  userHasUpvoted?: boolean
  categories?: { id: string; name: string }[]
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: "metadata.trending" })
  const path = "/trending"
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

// Composant Skeleton principal
function TrendingDataSkeleton() {
  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="px-3 sm:px-4">
        <div className="bg-muted h-8 w-64 animate-pulse rounded"></div>
      </div>
      <div className="-mx-3 flex flex-col sm:-mx-4">
        {Array(5)
          .fill(0)
          .map((_, index) => (
            <div
              key={index}
              className="mx-3 animate-pulse rounded-xl border border-zinc-100 bg-white/70 p-3 shadow-sm sm:mx-4 sm:p-4 dark:border-zinc-800/50 dark:bg-zinc-900/30"
            >
              <div className="flex items-start gap-3 sm:gap-4">
                <div className="flex-shrink-0">
                  <div className="bg-muted h-12 w-12 rounded-md sm:h-14 sm:w-14"></div>
                </div>
                <div className="min-w-0 flex-grow">
                  <div className="flex flex-col">
                    <div className="bg-muted mb-2 h-5 w-1/3 rounded"></div>
                    <div className="bg-muted h-4 w-2/3 rounded"></div>
                  </div>
                </div>
                <div className="flex flex-shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-start">
                  <div className="bg-muted h-10 w-10 rounded-xl border-2 border-dashed"></div>
                  <div className="bg-muted hidden h-10 w-10 rounded-xl border-2 border-dashed sm:block"></div>
                </div>
              </div>
            </div>
          ))}
      </div>
    </div>
  )
}

// Composant pour afficher les données
async function TrendingData({
  filter,
  isAuthenticated,
}: {
  filter: string
  isAuthenticated: boolean
}) {
  let projects: ProjectSummary[] = [] // Utiliser le type défini
  let title

  // These were hardcoded English on an eight-locale site. The titles reuse the
  // home page's existing translations where the wording already matches, and
  // only the genuinely new strings live in the `trending` namespace.
  const [t, tSections, tV2, locale] = await Promise.all([
    getTranslations("trending"),
    getTranslations("home.sections"),
    // The row's "{count} reviews" / "Rank {rank}" labels already exist for the
    // home feed; reusing them avoids a second identical translation set.
    getTranslations("home.v2"),
    getLocale(),
  ])
  const renderCommentLabel = (count: number) => tV2("reviewsCount", { count })
  const renderRankLabel = (rank: number) => tV2("rankLabel", { rank })

  if (filter === "today") {
    projects = await getTodayProjects(PROJECT_LIMITS_VARIABLES.VIEW_ALL_PAGE_TODAY_YESTERDAY_LIMIT)
    title = t("todayTitle")
  } else if (filter === "yesterday") {
    projects = await getYesterdayProjects(
      PROJECT_LIMITS_VARIABLES.VIEW_ALL_PAGE_TODAY_YESTERDAY_LIMIT,
    )
    title = tSections("yesterdayTitle")
  } else {
    projects = await getMonthBestProjects(PROJECT_LIMITS_VARIABLES.VIEW_ALL_PAGE_MONTH_LIMIT)
    title = tSections("monthTitle")
  }

  projects = await localizeProjectDescriptions(projects, locale)

  return (
    <div className="space-y-3 sm:space-y-4">
      {projects.length > 0 && (
        <ItemListSchema
          name={title}
          description={`${title} on aat.ee`}
          items={projects.map((p) => ({ name: p.name, slug: p.slug, logoUrl: p.logoUrl ?? "" }))}
          listType="project"
        />
      )}
      <div className="flex items-center justify-between">
        {/* This is the page's only page-level heading; it was an h2, which left
            /trending with no h1 at all. */}
        <SerifHeading as="h1" size="section" id="trending-heading">
          {title}
        </SerifHeading>
      </div>

      {projects.length === 0 ? (
        <div className="text-muted-foreground border-border bg-card rounded-lg border border-dashed py-8 text-center text-sm">
          {t("empty")}
        </div>
      ) : (
        // Same row as the home feed. It used to be a separate `ProjectCard`
        // whose whole body was a clickable div calling router.push — which
        // costs middle-click and open-in-new-tab, and gives assistive tech no
        // link to announce. `RankedRow` is a real <Link>; the interactive
        // controls ride along in its `actions` slot.
        <ol
          aria-labelledby="trending-heading"
          className="divide-home-hairline -mx-2 divide-y sm:-mx-3"
        >
          {projects.map((project: ProjectSummary, index: number) => (
            <RankedRow
              key={project.id}
              project={project}
              rank={index + 1}
              renderCommentLabel={renderCommentLabel}
              renderRankLabel={renderRankLabel}
              actions={
                <ProjectCardButtons
                  projectPageUrl={`/projects/${project.slug}`}
                  commentCount={project.commentCount ?? 0}
                  projectId={project.id}
                  upvoteCount={project.upvoteCount ?? 0}
                  isAuthenticated={isAuthenticated}
                  hasUpvoted={project.userHasUpvoted ?? false}
                  launchStatus={project.launchStatus}
                  projectName={project.name}
                />
              }
            />
          ))}
        </ol>
      )}
    </div>
  )
}

export default async function TrendingPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>
}) {
  const params = await searchParams
  const filter = params.filter || "today"

  // The sidebar lives in this component, not in `TrendingData`, so it needs its
  // own translator handles.
  const [t, tSections, topCategories, session] = await Promise.all([
    getTranslations("trending"),
    getTranslations("home.sections"),
    getTopCategories(5),
    auth.api.getSession({ headers: await headers() }),
  ])
  const isAuthenticated = !!session?.user

  const todayProjects = await getTodayProjects()
  const ongoingLaunches = todayProjects.filter(
    (project) => project.launchStatus === "ongoing",
  ).length

  return (
    <div className="bg-secondary/20">
      <div className="container mx-auto min-h-screen max-w-6xl px-4 pt-8 pb-12">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-3 lg:items-start">
          {/* Contenu principal */}
          <div className="space-y-6 sm:space-y-8 lg:col-span-2">
            <Suspense fallback={<TrendingDataSkeleton />}>
              <TrendingData filter={filter} isAuthenticated={isAuthenticated} />
            </Suspense>
          </div>

          {/* Sidebar */}
          <div className="top-24">
            {/* Quick Stats */}
            <div className="space-y-3 py-5 pt-0">
              <SerifHeading as="h2" size="eyebrow">
                {t("liveNow")}
              </SerifHeading>
              <Link
                href="/trending"
                className="bg-secondary/30 hover:bg-secondary/50 border-primary block rounded-md border-l-4 px-5 py-2 shadow-[0_1px_3px_rgba(0,0,0,0.05)] transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="text-primary text-2xl font-bold">{ongoingLaunches}</div>
                  <div className="text-sm font-medium">{t("activeLaunches")}</div>
                </div>
              </Link>
            </div>

            {/* Time Filters */}
            <div className="space-y-3 py-5">
              <SerifHeading as="h2" size="eyebrow">
                {t("timeRange")}
              </SerifHeading>
              <div className="space-y-2">
                <Link
                  href="/trending?filter=today"
                  className={`-mx-2 flex items-center gap-2 rounded-md p-2 text-sm transition-colors ${
                    filter === "today" ? "bg-muted font-medium" : "hover:bg-muted/40"
                  }`}
                >
                  Today&apos;s Launches
                </Link>
                <Link
                  href="/trending?filter=yesterday"
                  className={`-mx-2 flex items-center gap-2 rounded-md p-2 text-sm transition-colors ${
                    filter === "yesterday" ? "bg-muted font-medium" : "hover:bg-muted/40"
                  }`}
                >
                  Yesterday&apos;s Launches
                </Link>
                <Link
                  href="/trending?filter=month"
                  className={`-mx-2 flex items-center gap-2 rounded-md p-2 text-sm transition-colors ${
                    filter === "month" ? "bg-muted font-medium" : "hover:bg-muted/40"
                  }`}
                >
                  This Month&apos;s Best
                </Link>
              </div>
            </div>

            {/* Quick Access */}
            <div className="space-y-3 py-5">
              <SerifHeading as="h2" size="eyebrow">
                {tSections("quickAccess")}
              </SerifHeading>
              <div className="space-y-2">
                <Link
                  href="/winners"
                  className="-mx-2 flex items-center gap-2 rounded-md p-2 text-sm transition-colors hover:underline"
                >
                  Daily Winners
                </Link>
                <Link
                  href="/categories"
                  className="-mx-2 flex items-center gap-2 rounded-md p-2 text-sm transition-colors hover:underline"
                >
                  Browse Categories
                </Link>
              </div>
            </div>

            {/* Categories */}
            <div className="space-y-3 py-5">
              <div className="flex items-center justify-between">
                <SerifHeading as="h2" size="eyebrow">
                  {tSections("topCategories")}
                </SerifHeading>
                <Button variant="ghost" size="sm" className="text-sm" asChild>
                  <Link href="/categories" className="flex items-center gap-1">
                    View all
                  </Link>
                </Button>
              </div>
              <div className="space-y-2">
                {topCategories.map((category) => (
                  <Link
                    key={category.id}
                    href={`/categories?category=${category.id}`}
                    className="hover:bg-muted/40 -mx-2 flex items-center justify-between rounded-md p-2"
                  >
                    <span className="text-sm">{category.name}</span>
                    <span className="text-muted-foreground bg-secondary rounded-full px-2 py-0.5 text-xs">
                      {category.count} projects
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
