import { HomeBody, type HomeBodyData, type HomeBodyLabels } from "@/components/home/v2/home-body"
import type { HomeFeedProject } from "@/components/home/v2/ranked-row"

/**
 * Fixture-driven render of the REAL home page body.
 *
 * `HomeBody` is a pure function of data + labels, so this file lets the design
 * export (`bun run design:preview`) and the in-app `/design-preview` route show
 * the shipped Phase 2 layout without a database, a session or next-intl.
 *
 * The data below is invented but structurally identical to what
 * `app/[locale]/home-v2.tsx` passes in — if a prop shape drifts, this file
 * stops type-checking, which is the point.
 *
 * Logos are inline SVG data URIs so the exported HTML renders identically
 * opened from `file://` with no asset paths to resolve.
 */

function logoTile(letter: string, hue: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" rx="10" fill="hsl(${hue} 80% 92%)"/><text x="20" y="26" font-family="system-ui,sans-serif" font-size="18" font-weight="700" text-anchor="middle" fill="hsl(${hue} 70% 35%)">${letter}</text></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

const FIXTURE_PROJECTS: HomeFeedProject[] = [
  {
    id: "p1",
    slug: "nimbus-analytics",
    name: "Nimbus Analytics",
    tagline: "Privacy-first product analytics with warehouse sync",
    description: null,
    logoUrl: logoTile("N", 210),
    upvoteCount: 312,
    commentCount: 24,
    categories: [
      { id: "analytics", name: "Analytics" },
      { id: "saas", name: "SaaS" },
    ],
  },
  {
    id: "p2",
    slug: "slate-notes",
    name: "Slate Notes",
    tagline: "Markdown notebook that publishes straight to the web",
    description: null,
    logoUrl: logoTile("S", 150),
    upvoteCount: 268,
    commentCount: 11,
    categories: [{ id: "productivity", name: "Productivity" }],
  },
  {
    id: "p3",
    slug: "pixelforge",
    name: "Pixelforge",
    tagline: "Generate app store screenshots from one Figma frame",
    description: null,
    logoUrl: logoTile("P", 280),
    upvoteCount: 194,
    commentCount: 7,
    categories: [
      { id: "design", name: "Design" },
      { id: "dev", name: "Developer Tools" },
    ],
  },
  {
    id: "p4",
    slug: "mailstrait",
    name: "Mailstrait",
    tagline: "Deliverability monitoring for transactional email",
    description: null,
    logoUrl: logoTile("M", 20),
    upvoteCount: 88,
    commentCount: 3,
    categories: [{ id: "marketing", name: "Marketing Tools" }],
  },
  {
    id: "p5",
    slug: "quiet-hours",
    name: "Quiet Hours",
    tagline: "Focus timer that blocks notifications across devices",
    description: null,
    logoUrl: logoTile("Q", 330),
    upvoteCount: 41,
    commentCount: 0,
    categories: [{ id: "productivity", name: "Productivity" }],
  },
  {
    id: "p6",
    slug: "hexpack",
    name: "Hexpack",
    tagline: "Bundle any web app into a signed desktop build",
    description: null,
    logoUrl: logoTile("H", 45),
    upvoteCount: 27,
    commentCount: 2,
    categories: [{ id: "dev", name: "Developer Tools" }],
  },
]

export const HOME_FIXTURE_DATA: HomeBodyData = {
  projects: FIXTURE_PROJECTS,
  stats: { launchesThisMonth: 1248, launchedTotal: 3120 },
  community: [
    {
      id: 101,
      authorName: "Mira K.",
      authorImage: null,
      projectName: "Nimbus Analytics",
      projectSlug: "nimbus-analytics",
      projectLogo: logoTile("N", 210),
      createdAt: new Date("2026-09-10T09:12:00Z").toISOString(),
      excerpt:
        "We shipped warehouse sync this morning — happy to answer anything about the schema.",
    },
    {
      id: 102,
      authorName: "Devon",
      authorImage: null,
      projectName: "Slate Notes",
      projectSlug: "slate-notes",
      projectLogo: logoTile("S", 150),
      createdAt: new Date("2026-09-10T08:40:00Z").toISOString(),
      excerpt: "Does the web publishing support custom domains on the free plan?",
    },
    {
      id: 103,
      authorName: "Ana Ruiz",
      authorImage: null,
      projectName: "Pixelforge",
      projectSlug: "pixelforge",
      projectLogo: logoTile("P", 280),
      createdAt: new Date("2026-09-10T07:55:00Z").toISOString(),
      excerpt: "The Figma frame import handled our 14 locales without a single manual tweak.",
    },
    {
      id: 104,
      authorName: "Tomas",
      authorImage: null,
      projectName: "Mailstrait",
      projectSlug: "mailstrait",
      projectLogo: logoTile("M", 20),
      createdAt: new Date("2026-09-10T06:20:00Z").toISOString(),
      excerpt: "Been looking for exactly this since our last deliverability incident.",
    },
  ],
  blog: [
    {
      slug: "launch-checklists-for-solo-makers",
      title: "The best launch checklists for solo makers",
      description:
        "A short, opinionated checklist for the week before you launch — and the three things most makers forget.",
      image: null,
      tags: ["Guides"],
      publishedAt: new Date("2026-09-03T00:00:00Z").toISOString(),
    },
    {
      slug: "how-we-rank-launches",
      title: "How we rank launches on aat.ee",
      description:
        "What actually moves a product up the daily list, and what we deliberately ignore.",
      image: null,
      tags: ["Product"],
      publishedAt: new Date("2026-08-31T00:00:00Z").toISOString(),
    },
  ],
  categories: [
    { id: "all", name: "All categories", count: 4820 },
    { id: "ai", name: "Artificial Intelligence", count: 1089 },
    { id: "productivity", name: "Productivity", count: 649 },
    { id: "developer-tools", name: "Developer Tools", count: 482 },
    { id: "saas", name: "SaaS", count: 450 },
  ],
  nextLaunchIso: new Date(Date.now() + 20 * 3600_000 + 42 * 60_000 + 22_000).toISOString(),
  activeTab: "daily",
  tabs: [
    { key: "daily", label: "Daily", href: "#daily" },
    { key: "weekly", label: "Weekly", href: "#weekly" },
    { key: "monthly", label: "Monthly", href: "#monthly" },
  ],
  isAuthenticated: false,
  primaryCtaHref: "#submit",
  secondaryCtaHref: "#trending",
}

export const HOME_FIXTURE_LABELS: HomeBodyLabels = {
  hero: {
    title: "Where new products get their first push",
    subtitle:
      "Launch your product, earn a verified badge and a do-follow backlink, and discover what other makers shipped today.",
    primaryCta: "Submit your project",
    secondaryCta: "Explore today's launches",
    launchedTotal: "3,120 products launched",
  },
  heading: "Best products launching today",
  feedNote: "Weekly and monthly winners earn badges and are featured in our newsletter.",
  moreDetails: "More details",
  dailyArchives: "Daily archives",
  countdownLabel: "New launches in",
  empty: "No launches in this window yet.",
  showAllProducts: "Show all products",
  showAllHref: "#all",
  premiumTitle: "This premium spot is available",
  premiumCta: "Get featured",
  premiumHref: "#pricing",
  blogTitle: "Latest from the blog",
  left: {
    launchesThisMonth: "launches this month",
    latestPosts: "Latest posts",
  },
  right: {
    submitCta: "Submit Project",
    topCategories: "Top categories",
    quickAccess: "Quick access",
    trendingNow: "Trending now",
    dailyWinners: "Daily winners",
    bestOfMonth: "Best of month",
    yesterdayLaunches: "Yesterday's Launches",
    dashboard: "Dashboard",
    linuxAlliance: "Linux Docs Alliance",
    linuxAllianceFooter: "Check software support lifecycle at:",
    recommended: "Recommended",
    webcasaDesc: "AI-native open-source server control panel",
    litehttpdDesc: "Lightweight web server, highly compatible with Apache HTTPD",
    viewAll: "View all",
    renderProjectCount: (count: number) => `${count} projects`,
  },
  tabsLabel: "Ranking period",
  renderCommentLabel: (count: number) => `${count} reviews`,
  renderRankLabel: (rank: number) => `Rank ${rank}`,
}

export function HomeFixture() {
  return (
    <div className="bg-background text-foreground min-h-screen">
      <HomeBody data={HOME_FIXTURE_DATA} labels={HOME_FIXTURE_LABELS} locale="en" />
    </div>
  )
}
