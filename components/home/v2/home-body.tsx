import { Link } from "@/i18n/navigation"

import { PillButton } from "@/components/ds/pill-button"
import { SerifHeading } from "@/components/ds/serif-heading"

import { BlogStrip, type HomeBlogPost } from "./blog-strip"
import { HomeHero, type HomeHeroLabels } from "./home-hero"
import { LaunchCountdown } from "./launch-countdown"
import { LeftRail, type HomeCommunityPost } from "./left-rail"
import { PremiumSpot } from "./premium-spot"
import { RankedRow, type HomeFeedProject } from "./ranked-row"
import { RightRail, type HomeCategoryLink, type RightRailLabels } from "./right-rail"
import { TimeTabs, type HomeTimeTab } from "./time-tabs"

export interface HomeBodyLabels {
  hero: HomeHeroLabels
  /** Section title for the active window, e.g. "Best products launching today". */
  heading: string
  /** One-line explainer under the countdown. */
  feedNote: string
  moreDetails: string
  dailyArchives: string
  countdownLabel: string
  empty: string
  showAllProducts: string
  showAllHref: string
  premiumTitle: string
  premiumCta: string
  premiumHref: string
  blogTitle: string
  left: {
    launchesThisMonth: string
    makers: string
    latestPosts: string
  }
  right: RightRailLabels
  /** Already-translated landmark label for the period switcher. */
  tabsLabel: string
  /** "{count} reviews" */
  renderCommentLabel: (count: number) => string
  /** "Rank {rank}" */
  renderRankLabel: (rank: number) => string
}

export interface HomeBodyData {
  projects: HomeFeedProject[]
  stats: {
    launchesThisMonth: number
    makers: number
    /** Every completed launch, all time — what the hero's kicker states. */
    launchedTotal: number
  }
  community: HomeCommunityPost[]
  blog: HomeBlogPost[]
  categories: HomeCategoryLink[]
  /** ISO timestamp of the next launch-window boundary (countdown target). */
  nextLaunchIso: string
  activeTab: string
  tabs: HomeTimeTab[]
  isAuthenticated: boolean
  primaryCtaHref: string
  secondaryCtaHref: string
}

interface HomeBodyProps {
  data: HomeBodyData
  labels: HomeBodyLabels
  locale: string
}

/**
 * The redesigned home page body.
 *
 * Deliberately a pure function of `data` + `labels`: the route component owns
 * the database reads and `next-intl` lookups, while this file owns layout only.
 * That split is what lets `scripts/render-design-preview.tsx` render the very
 * same component against fixture data with no database, so the design can be
 * reviewed (and screenshotted in CI) without a live Postgres.
 *
 * Column order on desktop is set with `lg:order-*` while the DOM order is the
 * mobile reading order: feed, then the community rail, then the link rails.
 * CSS `order` only moves paint, not the tab sequence — putting the feed first
 * in the DOM is what keeps keyboard order and visual order aligned on mobile.
 */
export function HomeBody({ data, labels, locale }: HomeBodyProps) {
  const { projects, tabs, activeTab } = data

  return (
    // `data-home-v2` is the marker the smoke test keys on to prove the target
    // is actually serving this layout — without it, a misconfigured HOME_V2
    // would make the whole test pass against the legacy page.
    <div data-home-v2="true" className="container mx-auto max-w-6xl px-4 py-6 sm:py-8">
      <HomeHero
        labels={labels.hero}
        launchedTotal={data.stats.launchedTotal}
        primaryHref={data.primaryCtaHref}
        secondaryHref={data.secondaryCtaHref}
      />

      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-12 lg:gap-6">
        <div className="space-y-5 lg:order-2 lg:col-span-6">
          <TimeTabs
            tabs={tabs}
            activeKey={activeTab}
            ariaLabel={labels.tabsLabel}
            trailing={
              // Above-the-fold chrome, not a primary action: prefetching it
              // costs an RSC round-trip during load for a link most visitors
              // never take from here.
              <Link
                href="/winners"
                prefetch={false}
                className="text-muted-foreground hover:text-foreground text-xs underline-offset-4 hover:underline"
              >
                {labels.dailyArchives}
              </Link>
            }
          />

          <div className="space-y-2">
            <LaunchCountdown
              targetIso={data.nextLaunchIso}
              label={labels.countdownLabel}
              locale={locale}
            />
            <p className="text-muted-foreground text-sm">
              {labels.feedNote}{" "}
              <Link
                href="/pricing"
                className="text-home-accent-strong underline underline-offset-4"
              >
                {labels.moreDetails}
              </Link>
            </p>
          </div>

          <section className="space-y-3">
            <SerifHeading as="h2" id="home-feed-heading">
              {labels.heading}
            </SerifHeading>

            {projects.length === 0 ? (
              <p className="text-muted-foreground border-home-hairline rounded-home-card border border-dashed px-4 py-10 text-center text-sm">
                {labels.empty}
              </p>
            ) : (
              <ol aria-labelledby="home-feed-heading" className="divide-home-hairline divide-y">
                {projects.map((project, index) => (
                  <RankedRow
                    key={project.id}
                    project={project}
                    rank={index + 1}
                    renderCommentLabel={labels.renderCommentLabel}
                    renderRankLabel={labels.renderRankLabel}
                  />
                ))}
              </ol>
            )}
          </section>

          <PremiumSpot
            title={labels.premiumTitle}
            cta={labels.premiumCta}
            href={labels.premiumHref}
          />

          <div className="flex justify-center">
            <PillButton asChild variant="ink">
              <Link href={labels.showAllHref}>{labels.showAllProducts}</Link>
            </PillButton>
          </div>

          <BlogStrip title={labels.blogTitle} posts={data.blog} locale={locale} />
        </div>

        {/* DOM order: feed, community rail, links rail. `lg:order-1` moves the
            community rail back to the left column on desktop only. */}
        <aside className="lg:order-1 lg:col-span-3">
          <LeftRail
            labels={labels.left}
            stats={data.stats}
            posts={data.community}
            locale={locale}
          />
        </aside>

        <aside className="lg:order-3 lg:col-span-3">
          <RightRail
            labels={labels.right}
            isAuthenticated={data.isAuthenticated}
            categories={data.categories}
          />
        </aside>
      </div>
    </div>
  )
}
