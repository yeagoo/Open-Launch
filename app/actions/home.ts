"use server"

import { unstable_cache } from "next/cache"

import { db } from "@/drizzle/db"
import {
  blogArticle,
  fumaComments,
  launchStatus,
  project as projectTable,
  upvote,
  user as userTable,
} from "@/drizzle/db/schema"
import { and, desc, eq, gte, isNotNull, isNull, lt, sql } from "drizzle-orm"

import { HOME_PROJECTS_TAG, WINNERS_TAG } from "@/lib/cache-tags"
import { LAUNCH_SETTINGS, PROJECT_LIMITS_VARIABLES } from "@/lib/constants"
import { extractTextFromContent } from "@/lib/content-utils"
import { localizeProjectDescriptionGroups } from "@/lib/get-project-translation"
import {
  attachUserUpvotesToGroups,
  getUtcMonthWindow,
  getUtcWeekWindow,
  getUtcYearWindow,
  uniqueProjectIdsFromGroups,
} from "@/lib/home-project-groups"
import { getCurrentLaunchWindow } from "@/lib/launch-window"
import { attachCategories, getUpvotedSet, withUserUpvoted } from "@/lib/project-enrich"
import { clampInteger } from "@/lib/query-limits"
import { getCurrentUserId } from "@/lib/server-auth"
import { oneLineSummary } from "@/lib/text-summary"

const homeUpvoteCounts = db
  .select({
    projectId: upvote.projectId,
    upvoteCount: sql<number>`cast(count(${upvote.id}) as int)`.mapWith(Number).as("upvote_count"),
  })
  .from(upvote)
  .groupBy(upvote.projectId)
  .as("home_upvote_counts")

const homeCommentCounts = db
  .select({
    // Preserve Drizzle's table/column ownership through the subquery. A raw
    // SQL alias named `project_id` was emitted unqualified in the JOIN and
    // became ambiguous next to the upvote aggregate's `project_id`.
    projectId: fumaComments.page,
    commentCount: sql<number>`cast(count(${fumaComments.id}) as int)`
      .mapWith(Number)
      .as("comment_count"),
  })
  .from(fumaComments)
  .groupBy(fumaComments.page)
  .as("home_comment_counts")

// Reusable project-summary projection — the 4 listings on home /
// winners all need the exact same columns, and duplicating them is
// how `dailyRanking` and `commentCount` drift apart between
// listings during refactors.
const projectSummarySelect = {
  id: projectTable.id,
  name: projectTable.name,
  slug: projectTable.slug,
  description: projectTable.description,
  logoUrl: projectTable.logoUrl,
  websiteUrl: projectTable.websiteUrl,
  launchStatus: projectTable.launchStatus,
  launchType: projectTable.launchType,
  dailyRanking: projectTable.dailyRanking,
  scheduledLaunchDate: projectTable.scheduledLaunchDate,
  createdAt: projectTable.createdAt,
  upvoteCount: sql<number>`coalesce(${homeUpvoteCounts.upvoteCount}, 0)`.mapWith(Number),
  commentCount: sql<number>`coalesce(${homeCommentCounts.commentCount}, 0)`.mapWith(Number),
} as const

// ─── User-agnostic cached fetchers ──────────────────────────────────────────
// Each base fetcher is wrapped with `unstable_cache` so multiple
// home-page renders share one DB round-trip per cache window.
// User-specific augmentation (`userHasUpvoted`) is bolted on in the
// public entry points below.

const fetchTodayProjectsBase = unstable_cache(
  async (limit: number, windowStartIso: string, windowEndIso: string) => {
    const base = await db
      .select(projectSummarySelect)
      .from(projectTable)
      .leftJoin(homeUpvoteCounts, eq(homeUpvoteCounts.projectId, projectTable.id))
      .leftJoin(homeCommentCounts, eq(homeCommentCounts.projectId, projectTable.id))
      .where(
        and(
          eq(projectTable.launchStatus, launchStatus.ONGOING),
          gte(projectTable.scheduledLaunchDate, new Date(windowStartIso)),
          lt(projectTable.scheduledLaunchDate, new Date(windowEndIso)),
        ),
      )
      .orderBy(desc(sql`coalesce(${homeUpvoteCounts.upvoteCount}, 0)`))
      .limit(limit)
    return attachCategories(base)
  },
  ["home-today-projects-v2"],
  // 10 minutes covers the "live counter" expectation — fresh
  // upvotes/comments lag by at most 10 min, acceptable for a
  // launches feed. The `update-launches` cron explicitly busts
  // HOME_PROJECTS_TAG so today/yesterday transitions go live instantly.
  { revalidate: 600, tags: [HOME_PROJECTS_TAG] },
)

const fetchYesterdayProjectsBase = unstable_cache(
  async (limit: number, queryStartIso: string, yesterdayEndIso: string) => {
    const base = await db
      .select(projectSummarySelect)
      .from(projectTable)
      .leftJoin(homeUpvoteCounts, eq(homeUpvoteCounts.projectId, projectTable.id))
      .leftJoin(homeCommentCounts, eq(homeCommentCounts.projectId, projectTable.id))
      .where(
        and(
          eq(projectTable.launchStatus, launchStatus.LAUNCHED),
          sql`${projectTable.scheduledLaunchDate} >= ${queryStartIso}`,
          sql`${projectTable.scheduledLaunchDate} < ${yesterdayEndIso}`,
        ),
      )
      .orderBy(desc(sql`coalesce(${homeUpvoteCounts.upvoteCount}, 0)`))
      .limit(limit)
    return attachCategories(base)
  },
  ["home-yesterday-projects-v2"],
  // Yesterday's set is locked once we cross 8 AM UTC — 1h cache
  // is conservative; in practice it could be much longer.
  { revalidate: 3600, tags: [HOME_PROJECTS_TAG] },
)

/**
 * The query behind every leaderboard period. Week, month and year differ only
 * in the window they pass; that window is part of the cache key through the
 * arguments, so one cached function serves all three. Only *finished* launch
 * days rank — `ONGOING` projects are today's live race and belong to the Daily
 * view.
 */
const fetchLeaderboardProjectsBase = unstable_cache(
  async (limit: number, startIso: string, endIso: string) => {
    const base = await db
      .select(projectSummarySelect)
      .from(projectTable)
      .leftJoin(homeUpvoteCounts, eq(homeUpvoteCounts.projectId, projectTable.id))
      .leftJoin(homeCommentCounts, eq(homeCommentCounts.projectId, projectTable.id))
      .where(
        and(
          eq(projectTable.launchStatus, launchStatus.LAUNCHED),
          sql`${projectTable.scheduledLaunchDate} >= ${startIso}`,
          sql`${projectTable.scheduledLaunchDate} < ${endIso}`,
        ),
      )
      .orderBy(desc(sql`coalesce(${homeUpvoteCounts.upvoteCount}, 0)`))
      .limit(limit)
    return attachCategories(base)
  },
  ["home-leaderboard-projects-v1"],
  { revalidate: 3600, tags: [HOME_PROJECTS_TAG] },
)

const fetchWinnersByDateBase = unstable_cache(
  async (dayStartIso: string, dayEndIso: string) => {
    const base = await db
      .select(projectSummarySelect)
      .from(projectTable)
      .leftJoin(homeUpvoteCounts, eq(homeUpvoteCounts.projectId, projectTable.id))
      .leftJoin(homeCommentCounts, eq(homeCommentCounts.projectId, projectTable.id))
      .where(
        and(
          eq(projectTable.launchStatus, launchStatus.LAUNCHED),
          sql`${projectTable.dailyRanking} IS NOT NULL`,
          sql`${projectTable.dailyRanking} <= 3`,
          sql`${projectTable.scheduledLaunchDate} >= ${dayStartIso}`,
          sql`${projectTable.scheduledLaunchDate} <= ${dayEndIso}`,
        ),
      )
      .orderBy(projectTable.dailyRanking)
    return attachCategories(base)
  },
  ["winners-by-date-v2"],
  // Past winners are immutable once the 8 AM cron has stamped
  // `dailyRanking`. 6h is generous; tag-bust still catches the
  // initial transition.
  { revalidate: 21600, tags: [HOME_PROJECTS_TAG, WINNERS_TAG] },
)

// ─── Public entry points ────────────────────────────────────────────────────

function getYesterdayQueryWindow(now = new Date()) {
  const isBeforeLaunchTime = now.getUTCHours() < LAUNCH_SETTINGS.LAUNCH_HOUR_UTC
  const yesterdayStart = new Date(now)
  yesterdayStart.setUTCHours(LAUNCH_SETTINGS.LAUNCH_HOUR_UTC, 0, 0, 0)
  yesterdayStart.setUTCDate(yesterdayStart.getUTCDate() - (isBeforeLaunchTime ? 2 : 1))

  const yesterdayEnd = new Date(yesterdayStart)
  yesterdayEnd.setUTCDate(yesterdayEnd.getUTCDate() + 1)

  // Extend window start to midnight to include projects launched at 00:00.
  const queryStart = new Date(yesterdayStart)
  queryStart.setUTCHours(0, 0, 0, 0)

  return { queryStart, yesterdayEnd }
}

/**
 * Homepage-specific grouped read. The three cached public project sets stay
 * independent, while the request-scoped user augmentation is performed once
 * across their combined project IDs.
 */
export async function getHomeProjectGroups(locale?: string) {
  const todayWindow = getCurrentLaunchWindow()
  const yesterdayWindow = getYesterdayQueryWindow()
  const monthWindow = getUtcMonthWindow(new Date())

  const [todayBase, yesterdayBase, monthBase, userId] = await Promise.all([
    fetchTodayProjectsBase(
      PROJECT_LIMITS_VARIABLES.TODAY_LIMIT,
      todayWindow.start.toISOString(),
      todayWindow.end.toISOString(),
    ),
    fetchYesterdayProjectsBase(
      PROJECT_LIMITS_VARIABLES.YESTERDAY_LIMIT,
      yesterdayWindow.queryStart.toISOString(),
      yesterdayWindow.yesterdayEnd.toISOString(),
    ),
    fetchLeaderboardProjectsBase(
      PROJECT_LIMITS_VARIABLES.MONTH_LIMIT,
      monthWindow.start.toISOString(),
      monthWindow.end.toISOString(),
    ),
    getCurrentUserId(),
  ])

  const baseGroups = [todayBase, yesterdayBase, monthBase]
  const projectIds = uniqueProjectIdsFromGroups(baseGroups)
  const [upvoted, displayGroups] = await Promise.all([
    getUpvotedSet(userId, projectIds),
    locale ? localizeProjectDescriptionGroups(baseGroups, locale) : Promise.resolve(baseGroups),
  ])

  return attachUserUpvotesToGroups(displayGroups, upvoted)
}

export async function getTodayProjects(limit: number = PROJECT_LIMITS_VARIABLES.TODAY_LIMIT) {
  limit = clampInteger(limit, PROJECT_LIMITS_VARIABLES.TODAY_LIMIT, 1, 100)
  const { start, end } = getCurrentLaunchWindow()
  const [base, userId] = await Promise.all([
    fetchTodayProjectsBase(limit, start.toISOString(), end.toISOString()),
    getCurrentUserId(),
  ])
  const upvoted = await getUpvotedSet(
    userId,
    base.map((p) => p.id),
  )
  return withUserUpvoted(base, upvoted)
}

export async function getYesterdayProjects(
  limit: number = PROJECT_LIMITS_VARIABLES.YESTERDAY_LIMIT,
) {
  limit = clampInteger(limit, PROJECT_LIMITS_VARIABLES.YESTERDAY_LIMIT, 1, 100)
  const { queryStart, yesterdayEnd } = getYesterdayQueryWindow()

  const [base, userId] = await Promise.all([
    fetchYesterdayProjectsBase(limit, queryStart.toISOString(), yesterdayEnd.toISOString()),
    getCurrentUserId(),
  ])
  const upvoted = await getUpvotedSet(
    userId,
    base.map((p) => p.id),
  )
  return withUserUpvoted(base, upvoted)
}

export async function getMonthBestProjects(limit: number = PROJECT_LIMITS_VARIABLES.MONTH_LIMIT) {
  limit = clampInteger(limit, PROJECT_LIMITS_VARIABLES.MONTH_LIMIT, 1, 100)
  const monthWindow = getUtcMonthWindow(new Date())

  const [base, userId] = await Promise.all([
    fetchLeaderboardProjectsBase(
      limit,
      monthWindow.start.toISOString(),
      monthWindow.end.toISOString(),
    ),
    getCurrentUserId(),
  ])
  const upvoted = await getUpvotedSet(
    userId,
    base.map((p) => p.id),
  )
  return withUserUpvoted(base, upvoted)
}

export async function getWinnersByDate(date: Date) {
  const dayStart = new Date(date)
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(date)
  dayEnd.setHours(23, 59, 59, 999)

  const [base, userId] = await Promise.all([
    fetchWinnersByDateBase(dayStart.toISOString(), dayEnd.toISOString()),
    getCurrentUserId(),
  ])
  const upvoted = await getUpvotedSet(
    userId,
    base.map((p) => p.id),
  )
  return withUserUpvoted(base, upvoted)
}

// ─── Home v2 (three-column home layout) ─────────────────────────────────────
//
// Everything below feeds the redesigned home page only. It is additive: the
// legacy two-column home keeps using the fetchers above, so a rollback via the
// HOME_V2 flag never depends on anything in this section.
//
// Cache discipline matches the rest of the file — every fetcher is
// `unstable_cache`-wrapped and tagged with HOME_PROJECTS_TAG so the 8 AM
// launch-transition cron busts the whole home surface at once.

/**
 * Rolling-7-day leaderboard behind the home page's "Weekly" tab.
 *
 * Mirrors `getMonthBestProjects` exactly (same projection, same upvote
 * augmentation, same locale merge) so the two tabs differ only by window.
 * The default limit matches the Daily tab's list length — the three tabs sit
 * behind one switcher, so a 20-row Daily next to a 5-row Weekly read as a bug.
 */
export async function getHomeWeekProjects(
  limit: number = PROJECT_LIMITS_VARIABLES.TODAY_LIMIT,
  locale?: string,
) {
  limit = clampInteger(limit, PROJECT_LIMITS_VARIABLES.TODAY_LIMIT, 1, 100)
  // `unstable_cache` derives its key from the arguments, so passing a
  // millisecond-precision `now` would mint a brand-new cache entry on every
  // request: the TTL and the HOME_PROJECTS_TAG bust would never apply, and the
  // key space would grow without bound. Flooring to the revalidate window (1h)
  // keeps the rolling-7-day semantics while making the key stable.
  const now = new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000)
  const { start, end } = getUtcWeekWindow(now)

  const [base, userId] = await Promise.all([
    fetchLeaderboardProjectsBase(limit, start.toISOString(), end.toISOString()),
    getCurrentUserId(),
  ])
  const upvoted = await getUpvotedSet(
    userId,
    base.map((p) => p.id),
  )
  const withUpvotes = withUserUpvoted(base, upvoted)
  if (!locale) return withUpvotes
  return (await localizeProjectDescriptionGroups([withUpvotes], locale))[0]
}

/**
 * Month leaderboard for the home page's "Monthly" tab.
 *
 * Same cached fetcher the legacy home and `/trending` already use — the only
 * difference is the limit and the locale merge, so a taller Monthly list costs
 * one more cache entry rather than a new query.
 */
export async function getHomeMonthProjects(
  limit: number = PROJECT_LIMITS_VARIABLES.TODAY_LIMIT,
  locale?: string,
) {
  limit = clampInteger(limit, PROJECT_LIMITS_VARIABLES.TODAY_LIMIT, 1, 100)
  const { start, end } = getUtcMonthWindow(new Date())

  const [base, userId] = await Promise.all([
    fetchLeaderboardProjectsBase(limit, start.toISOString(), end.toISOString()),
    getCurrentUserId(),
  ])
  const upvoted = await getUpvotedSet(
    userId,
    base.map((p) => p.id),
  )
  const withUpvotes = withUserUpvoted(base, upvoted)
  if (!locale) return withUpvotes
  return (await localizeProjectDescriptionGroups([withUpvotes], locale))[0]
}

const fetchHomeStatsBase = unstable_cache(
  async (
    monthStartIso: string,
    monthEndIso: string,
    todayStartIso: string,
    todayEndIso: string,
    nextStartIso: string,
    nextEndIso: string,
  ) => {
    const countProjects = (where: ReturnType<typeof and>) =>
      db
        .select({ value: sql<number>`cast(count(*) as int)`.mapWith(Number) })
        .from(projectTable)
        .where(where)

    const [launchCount, makerCount, todayCount, queuedCount] = await Promise.all([
      // Launched OR ongoing: "N launches this month" should include the race
      // that is running right now, unlike the leaderboards.
      countProjects(
        and(
          sql`${projectTable.launchStatus} in (${launchStatus.LAUNCHED}, ${launchStatus.ONGOING})`,
          sql`${projectTable.scheduledLaunchDate} >= ${monthStartIso}`,
          sql`${projectTable.scheduledLaunchDate} < ${monthEndIso}`,
        ),
      ),
      db
        .select({ value: sql<number>`cast(count(*) as int)`.mapWith(Number) })
        .from(userTable)
        // `is_bot` is nullable with a default of false, so `= false` alone
        // would silently drop legacy NULL rows from the maker count.
        .where(sql`coalesce(${userTable.isBot}, false) = false`),
      // Today's live batch — exactly the window the home feed is showing.
      countProjects(
        and(
          eq(projectTable.launchStatus, launchStatus.ONGOING),
          sql`${projectTable.scheduledLaunchDate} >= ${todayStartIso}`,
          sql`${projectTable.scheduledLaunchDate} < ${todayEndIso}`,
        ),
      ),
      // The queue for the NEXT window, i.e. what a submitter is racing
      // against. Scheduled-but-unpaid rows are excluded on purpose: they are
      // not committed launches yet.
      countProjects(
        and(
          eq(projectTable.launchStatus, launchStatus.SCHEDULED),
          sql`${projectTable.scheduledLaunchDate} >= ${nextStartIso}`,
          sql`${projectTable.scheduledLaunchDate} < ${nextEndIso}`,
        ),
      ),
    ])

    return {
      launchesThisMonth: launchCount[0]?.value ?? 0,
      makers: makerCount[0]?.value ?? 0,
      launchesToday: todayCount[0]?.value ?? 0,
      queuedNext: queuedCount[0]?.value ?? 0,
    }
  },
  ["home-stats-v2"],
  { revalidate: 3600, tags: [HOME_PROJECTS_TAG] },
)

/**
 * Candidate logos for the hero wall, newest first.
 *
 * The wall used to draw from this month's launches only, which is too small a
 * pool to choose from: measured across the catalogue, 9 of 50 logos are marks
 * with a transparent background, and a single month rarely contains more than a
 * handful of them. That is why the wall read as a patchwork — not because the
 * wrong logos were picked, but because the right ones were not eligible.
 *
 * The caller ranks these by measured quality (`lib/logo-wall-quality`), so this
 * only has to return enough of them and stay cheap: `id` and `logoUrl`, no
 * joins, capped.
 */
export async function getWallLogoCandidates(limit: number = 400) {
  limit = clampInteger(limit, 400, 1, 1000)
  return fetchWallLogoCandidatesBase(limit)
}

const fetchWallLogoCandidatesBase = unstable_cache(
  async (limit: number) => {
    return db
      .select({ id: projectTable.id, logoUrl: projectTable.logoUrl })
      .from(projectTable)
      .where(
        and(
          sql`${projectTable.logoUrl} is not null`,
          sql`${projectTable.logoUrl} <> ''`,
          // Everything committed to a launch window, including the queue:
          // a queued product's mark is as real as a launched one, and
          // excluding the queue cost three of the nine marks that qualify.
          sql`${projectTable.launchStatus} in (${launchStatus.LAUNCHED}, ${launchStatus.ONGOING}, ${launchStatus.SCHEDULED})`,
        ),
      )
      .orderBy(desc(projectTable.scheduledLaunchDate))
      .limit(limit)
  },
  ["wall-logo-candidates-v1"],
  { revalidate: 3600, tags: [HOME_PROJECTS_TAG] },
)

/**
 * Headline numbers for the hero and the left rail.
 *
 * Replaces the reference layout's "visits this month" counter, which this app
 * has no data source for (page views only ever went to Matomo/GA). These are
 * real, DB-backed numbers instead of a decorative fake: this month's launches
 * and registered makers (left rail), plus today's live batch and the queue for
 * the next window (hero).
 */
/**
 * Same shape as the weekly and monthly fetchers, over the calendar year. The
 * leaderboard page is the only caller; the home page uses the weekly and
 * monthly ones for its tabs.
 */
export async function getLeaderboardYearProjects(
  limit: number = PROJECT_LIMITS_VARIABLES.TODAY_LIMIT,
  locale?: string,
) {
  limit = clampInteger(limit, PROJECT_LIMITS_VARIABLES.TODAY_LIMIT, 1, 100)
  const { start, end } = getUtcYearWindow(new Date())

  const [base, userId] = await Promise.all([
    fetchLeaderboardProjectsBase(limit, start.toISOString(), end.toISOString()),
    getCurrentUserId(),
  ])
  const upvoted = await getUpvotedSet(
    userId,
    base.map((p) => p.id),
  )
  const withUpvotes = withUserUpvoted(base, upvoted)
  if (!locale) return withUpvotes
  return (await localizeProjectDescriptionGroups([withUpvotes], locale))[0]
}

export async function getHomeStats() {
  const { start, end } = getUtcMonthWindow(new Date())
  const today = getCurrentLaunchWindow()
  // Next window = the day after the current one ends.
  const nextStart = today.end
  const nextEnd = new Date(nextStart)
  nextEnd.setUTCDate(nextEnd.getUTCDate() + 1)

  return fetchHomeStatsBase(
    start.toISOString(),
    end.toISOString(),
    today.start.toISOString(),
    today.end.toISOString(),
    nextStart.toISOString(),
    nextEnd.toISOString(),
  )
}

const fetchLatestCommunityPostsBase = unstable_cache(
  async (limit: number) => {
    // ── Simulated engagement is INCLUDED here, on purpose ────────────────────
    // Production measurement (2026-09-10): of the 20 most recent comments, 19
    // are authored by `bot-user-*` accounts, and of 6289 total comments only 88
    // are human — the newest human one is 10 months old. Excluding bots would
    // therefore empty this rail entirely (the component renders nothing for an
    // empty list), which is why bot comments are kept.
    //
    // This is a deliberate product decision, not an oversight: the site already
    // presents simulated engagement in its upvote and comment counters
    // (see VIRTUAL_ENGAGEMENT.md), and the bot-authored bodies read as ordinary
    // discussion. If a future change *does* want to filter them, it must also
    // decide what replaces the rail — filtering alone silently deletes the
    // block. Do not "fix" this without that decision.
    const rows = await db
      .select({
        id: fumaComments.id,
        content: fumaComments.content,
        createdAt: fumaComments.timestamp,
        authorId: fumaComments.author,
        authorName: userTable.name,
        authorImage: userTable.image,
        projectName: projectTable.name,
        projectSlug: projectTable.slug,
        projectLogo: projectTable.logoUrl,
      })
      .from(fumaComments)
      // `page` holds the project id, not a URL path — same join contract the
      // comment counters above rely on. The inner join also drops comments on
      // projects that have since been deleted.
      .innerJoin(projectTable, eq(projectTable.id, fumaComments.page))
      .leftJoin(userTable, eq(userTable.id, fumaComments.author))
      // Tombstoned comments keep their row but their body is replaced, so
      // they must never surface in the community rail.
      .where(isNull(fumaComments.hiddenAt))
      .orderBy(desc(fumaComments.timestamp))
      .limit(limit)

    return rows.map((row) => ({
      id: row.id,
      authorName: row.authorName?.trim() || row.authorId,
      authorImage: row.authorImage,
      projectName: row.projectName,
      projectSlug: row.projectSlug,
      projectLogo: row.projectLogo,
      // `unstable_cache` serializes its return value, so a Date read back from
      // the cache is a STRING. Serialize it here, at the boundary, so the type
      // the components receive is the type they actually get at runtime.
      createdAt: row.createdAt.toISOString(),
      // Comment bodies are Fuma rich-text JSON; the rail only needs one line.
      excerpt: oneLineSummary(extractTextFromContent(row.content), 90),
    }))
  },
  ["home-latest-posts-v1"],
  // Short window: this is the "community is alive" signal, so it should move
  // roughly as fast as the comment counts already shown on each row.
  { revalidate: 600, tags: [HOME_PROJECTS_TAG] },
)

/** Latest non-hidden comments, shaped for the left rail's "Latest posts" feed. */
export async function getLatestCommunityPosts(limit = 4) {
  return fetchLatestCommunityPostsBase(clampInteger(limit, 4, 1, 20))
}
const fetchLatestBlogPostsBase = unstable_cache(
  async (limit: number) =>
    db
      .select({
        slug: blogArticle.slug,
        title: blogArticle.title,
        description: blogArticle.description,
        image: blogArticle.image,
        tags: blogArticle.tags,
        publishedAt: blogArticle.publishedAt,
      })
      .from(blogArticle)
      // Drafts are auto-generated recaps awaiting human review; they are
      // unlisted everywhere else, so they stay unlisted here too.
      .where(eq(blogArticle.status, "published"))
      .orderBy(desc(blogArticle.publishedAt))
      .limit(limit)
      // ISO string, not Date: see the note on `createdAt` above — anything
      // crossing `unstable_cache` comes back JSON-serialized, and handing a
      // string to `Intl.DateTimeFormat.format()` throws `Invalid time value`.
      .then((rows) => rows.map((row) => ({ ...row, publishedAt: row.publishedAt.toISOString() }))),
  ["home-latest-blog-v1"],
  { revalidate: 3600, tags: [HOME_PROJECTS_TAG] },
)

/** Newest published blog posts for the home page's blog strip. */
export async function getLatestBlogPosts(limit = 4) {
  return fetchLatestBlogPostsBase(clampInteger(limit, 4, 1, 12))
}

const fetchHomeMakersBase = unstable_cache(
  async (limit: number) => {
    const rows = await db
      .select({
        id: userTable.id,
        name: userTable.name,
        image: userTable.image,
      })
      .from(projectTable)
      .innerJoin(userTable, eq(userTable.id, projectTable.createdBy))
      .where(
        and(
          isNotNull(projectTable.createdBy),
          // Same bot exclusion as the maker count right next to it in the hero.
          // Without it the stack could be nothing but `bot-user-*` accounts:
          // the Product Hunt import cron attributes imported projects to a bot
          // creator, and this list is ordered by most recent launch.
          sql`coalesce(${userTable.isBot}, false) = false`,
        ),
      )
      // No `image IS NOT NULL` filter: plenty of real accounts never upload an
      // avatar, and `HomeHero` renders an initial-disc fallback for exactly
      // that case. Filtering here would silently shrink the stack to whoever
      // happens to have a picture.
      .groupBy(userTable.id, userTable.name, userTable.image)
      // Most recent launchers first: the hero's avatar stack should read as
      // "people shipping right now", not "people who signed up".
      .orderBy(desc(sql`max(${projectTable.createdAt})`))
      .limit(limit)

    return rows
  },
  ["home-makers-v1"],
  { revalidate: 3600, tags: [HOME_PROJECTS_TAG] },
)

/** Recent launchers (with avatars) for the hero's social-proof stack. */
export async function getHomeMakers(limit = 5) {
  return fetchHomeMakersBase(clampInteger(limit, 5, 1, 12))
}
