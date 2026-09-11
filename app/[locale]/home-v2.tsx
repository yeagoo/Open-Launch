import { NextIntlClientProvider } from "next-intl"
import { getMessages, getTranslations } from "next-intl/server"

import { pickClientMessages } from "@/lib/client-messages"
import { PROJECT_LIMITS_VARIABLES } from "@/lib/constants"
import { getCurrentLaunchWindow } from "@/lib/launch-window"
import { getServerSession } from "@/lib/server-auth"
import { HomeBody, type HomeBodyData, type HomeBodyLabels } from "@/components/home/v2/home-body"
import type { HomeTimeTab } from "@/components/home/v2/time-tabs"
import { ItemListSchema } from "@/components/seo/structured-data"
import {
  getHomeMonthProjects,
  getHomeProjectGroups,
  getHomeStats,
  getHomeWeekProjects,
  getLatestBlogPosts,
  getLatestCommunityPosts,
} from "@/app/actions/home"
import { getTopCategories } from "@/app/actions/projects"

export type HomeTab = "daily" | "weekly" | "monthly"

const TABS: HomeTab[] = ["daily", "weekly", "monthly"]

// "Show all products" must land on a filter /trending actually understands —
// it has no `weekly` filter, so the weekly tab falls back to the plain list.
const SHOW_ALL_HREF: Record<HomeTab, string> = {
  daily: "/trending?filter=today",
  weekly: "/trending",
  monthly: "/trending?filter=month",
}

export function parseHomeTab(value: string | undefined): HomeTab {
  return TABS.find((tab) => tab === value) ?? "daily"
}

/**
 * Server half of the redesigned home page: every database read and every
 * translation lookup lives here, and the layout itself lives in the pure
 * `HomeBody` component (which is also what the offline design preview renders
 * against fixtures).
 *
 * `tab` is a real query param (`/?tab=weekly`) rather than client state: the
 * three windows are three different queries, so a tab switch should be a
 * navigation that the RSC cache and the CDN can both serve.
 */
export async function HomeV2({ locale, tab }: { locale: string; tab: HomeTab }) {
  const [
    t,
    tMetadata,
    tSections,
    tCommon,
    tNav,
    messages,
    groups,
    stats,
    community,
    blog,
    categories,
    session,
    tabProjects,
  ] = await Promise.all([
    getTranslations("home.v2"),
    getTranslations("home.metadata"),
    getTranslations("home.sections"),
    getTranslations("common"),
    getTranslations("nav"),
    getMessages(),
    getHomeProjectGroups(locale),
    getHomeStats(),
    getLatestCommunityPosts(4),
    getLatestBlogPosts(2),
    getTopCategories(5),
    getServerSession(),
    // Only paid for when a non-default tab is actually open — the conditional
    // still resolves inside the same Promise.all, so the tab costs one
    // parallel cached query rather than a sequential round-trip.
    tab === "weekly"
      ? getHomeWeekProjects(PROJECT_LIMITS_VARIABLES.TODAY_LIMIT, locale)
      : tab === "monthly"
        ? getHomeMonthProjects(PROJECT_LIMITS_VARIABLES.TODAY_LIMIT, locale)
        : Promise.resolve(null),
  ])

  const [todayProjects] = groups
  // The Daily tab reuses the grouped read (it is the same window); Weekly and
  // Monthly come from their own fetchers so all three tabs render a list of
  // the same length.
  const projects = tab === "daily" ? todayProjects : (tabProjects ?? [])

  const tabs: HomeTimeTab[] = [
    { key: "daily", label: t("tabs.daily"), href: "/" },
    { key: "weekly", label: t("tabs.weekly"), href: "/?tab=weekly" },
    { key: "monthly", label: t("tabs.monthly"), href: "/?tab=monthly" },
  ]

  const heading =
    tab === "weekly"
      ? tSections("weekTitle")
      : tab === "monthly"
        ? tSections("monthTitle")
        : tSections("todayTitle")

  const labels: HomeBodyLabels = {
    hero: {
      title: t("hero.title"),
      subtitle: t("hero.subtitle"),
      primaryCta: t("hero.primaryCta"),
      secondaryCta: t("hero.secondaryCta"),
      launchedTotal: t("hero.launchedTotal", { count: stats.launchedTotal }),
    },
    heading,
    feedNote: t("feedNote"),
    moreDetails: t("moreDetails"),
    dailyArchives: t("dailyArchives"),
    countdownLabel: t("countdownLabel"),
    empty: t("empty"),
    showAllProducts: t("showAllProducts"),
    showAllHref: SHOW_ALL_HREF[tab],
    premiumTitle: t("premiumTitle"),
    premiumCta: t("premiumCta"),
    premiumHref: "/pricing",
    blogTitle: t("blogTitle"),
    left: {
      launchesThisMonth: t("launchesThisMonth"),
      latestPosts: t("latestPosts"),
    },
    right: {
      submitCta: tNav("submitProject"),
      topCategories: tSections("topCategories"),
      quickAccess: tSections("quickAccess"),
      trendingNow: tSections("trendingNow"),
      dailyWinners: tSections("dailyWinners"),
      bestOfMonth: tSections("bestOfMonth"),
      yesterdayLaunches: tSections("yesterdayTitle"),
      dashboard: tSections("dashboard"),
      linuxAlliance: tSections("linuxAlliance"),
      linuxAllianceFooter: tSections("linuxAllianceFooter"),
      recommended: tSections("recommended"),
      webcasaDesc: tSections("webcasaDesc"),
      litehttpdDesc: tSections("litehttpdDesc"),
      viewAll: tCommon("viewAll"),
      renderProjectCount: (count: number) => tSections("projectsCount", { count }),
    },
    tabsLabel: t("tabsLabel"),
    renderCommentLabel: (count: number) => t("reviewsCount", { count }),
    renderRankLabel: (rank: number) => t("rankLabel", { rank }),
  }

  const data: HomeBodyData = {
    projects,
    stats,
    community,
    blog,
    categories,
    // The countdown targets the end of the CURRENT launch window, i.e. when
    // the next batch goes live.
    nextLaunchIso: getCurrentLaunchWindow().end.toISOString(),
    activeTab: tab,
    tabs,
    isAuthenticated: Boolean(session?.user),
    primaryCtaHref: "/projects/submit",
    secondaryCtaHref: "/trending",
  }

  return (
    // The root layout's `<div>` provider ships an EMPTY message bundle (see
    // app/layout.tsx), and `search` is only handed to the Nav. The right rail
    // renders the shared `SearchCommandLazy`, which calls
    // `useTranslations("search")` during SSR — without this provider it would
    // render the literal string "search.placeholder" in every locale. Every
    // other page rendering that component wraps itself the same way.
    <NextIntlClientProvider messages={pickClientMessages(messages, ["search"])}>
      {/* Structured data is emitted for the canonical Daily view only. The
          weekly/monthly variants are query-param views of the same URL that
          canonicalises to "/", and labelling a weekly ranking "Today's
          Launched Products" (the only home-metadata copy that exists) would be
          wrong structured data rather than richer structured data. */}
      {tab === "daily" && projects.length > 0 && (
        <ItemListSchema
          name={tMetadata("today")}
          description={tMetadata("todayDesc")}
          items={projects.map((project) => ({
            name: project.name,
            slug: project.slug,
            logoUrl: project.logoUrl,
          }))}
          listType="project"
        />
      )}
      <HomeBody data={data} labels={labels} locale={locale} />
    </NextIntlClientProvider>
  )
}
