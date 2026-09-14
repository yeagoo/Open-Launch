import type { Metadata } from "next"

import { getTranslations } from "next-intl/server"

import { PROJECT_LIMITS_VARIABLES } from "@/lib/constants"
import { buildLocaleAlternates, buildLocaleOpenGraph } from "@/lib/i18n-metadata"
import { SerifHeading } from "@/components/ds/serif-heading"
import { RankedRow } from "@/components/home/v2/ranked-row"
import { TimeTabs, type HomeTimeTab } from "@/components/home/v2/time-tabs"
import { Breadcrumb } from "@/components/layout/breadcrumb"
import { ItemListSchema } from "@/components/seo/structured-data"
import {
  getHomeMonthProjects,
  getHomeWeekProjects,
  getLeaderboardYearProjects,
} from "@/app/actions/home"

const PERIODS = ["week", "month", "year"] as const
type Period = (typeof PERIODS)[number]

const PATH = "/leaderboard"

function parsePeriod(value: string | undefined): Period {
  return PERIODS.find((period) => period === value) ?? "week"
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: "leaderboard" })
  const title = t("weekTitle")
  return {
    title,
    description: t("intro"),
    alternates: buildLocaleAlternates(PATH, locale),
    openGraph: {
      title,
      description: t("intro"),
      ...buildLocaleOpenGraph(PATH, locale),
    },
  }
}

/**
 * Weekly, monthly and yearly leaderboards.
 *
 * The home page carries daily/weekly/monthly as tabs on its feed; this page
 * exists because the **yearly** board had no home at all, and because a
 * leaderboard is worth a stable, linkable URL of its own. Periods are query
 * parameters rather than client state so each one is a real, shareable page —
 * the same reasoning as the home tabs.
 *
 * Ranking rule, shared with the home tabs: only `LAUNCHED` projects appear, so
 * a project is ranked on its finished launch day rather than mid-race.
 */
export default async function LeaderboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ period?: string }>
}) {
  const [{ locale }, { period: periodParam }] = await Promise.all([params, searchParams])
  const period = parsePeriod(periodParam)

  const limit = PROJECT_LIMITS_VARIABLES.VIEW_ALL_PAGE_TODAY_YESTERDAY_LIMIT
  const projectsPromise =
    period === "year"
      ? getLeaderboardYearProjects(limit, locale)
      : period === "month"
        ? getHomeMonthProjects(limit, locale)
        : getHomeWeekProjects(limit, locale)
  const [t, tBreadcrumb, tV2, projects] = await Promise.all([
    getTranslations("leaderboard"),
    getTranslations("breadcrumb"),
    getTranslations("home.v2"),
    projectsPromise,
  ])

  const title = t(`${period}Title` as const)
  const tabs: HomeTimeTab[] = [
    { key: "week", label: t("week"), href: `${PATH}?period=week` },
    { key: "month", label: t("month"), href: `${PATH}?period=month` },
    { key: "year", label: t("year"), href: `${PATH}?period=year` },
  ]
  const renderCommentLabel = (count: number) => tV2("reviewsCount", { count })
  const renderRankLabel = (rank: number) => tV2("rankLabel", { rank })

  return (
    <div className="bg-secondary/20 min-h-screen">
      <div className="container mx-auto min-h-screen max-w-4xl px-4 pt-8 pb-12">
        <Breadcrumb
          items={[{ name: tBreadcrumb("home"), href: "/" }, { name: tBreadcrumb("leaderboard") }]}
        />

        <div className="mb-6 space-y-2">
          <SerifHeading as="h1" size="section" id="leaderboard-heading">
            {title}
          </SerifHeading>
          <p className="text-muted-foreground text-sm">{t("intro")}</p>
        </div>

        <TimeTabs tabs={tabs} activeKey={period} ariaLabel={t("tabsLabel")} />

        {projects.length > 0 && (
          <ItemListSchema
            name={title}
            description={t("intro")}
            items={projects.map((project) => ({
              name: project.name,
              slug: project.slug,
              logoUrl: project.logoUrl ?? "",
            }))}
            listType="project"
          />
        )}

        {projects.length === 0 ? (
          <div className="text-muted-foreground border-border bg-card mt-4 rounded-lg border border-dashed py-8 text-center text-sm">
            {t("empty")}
          </div>
        ) : (
          <ol
            aria-labelledby="leaderboard-heading"
            className="divide-home-hairline -mx-2 mt-4 divide-y sm:-mx-3"
          >
            {projects.map((project, index) => (
              <RankedRow
                key={project.id}
                project={project}
                rank={index + 1}
                renderCommentLabel={renderCommentLabel}
                renderRankLabel={renderRankLabel}
              />
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}
