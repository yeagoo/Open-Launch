import { unstable_cache } from "next/cache"

import { db } from "@/drizzle/db"
import {
  alternativePage,
  blogArticle,
  comparisonPage,
  launchStatus,
  project,
  seoArticle,
  tag,
  tagModerationStatus,
} from "@/drizzle/db/schema"
import { eq, or } from "drizzle-orm"

import { SITEMAP_ENTRIES_TAG } from "@/lib/cache-tags"
import {
  englishSitemapEntry,
  localizedSitemapEntries,
  parseSitemapRoute,
  serializeSitemap,
  SITEMAP_SOURCE_ROWS_PER_SHARD,
  type SitemapEntry,
  type SitemapKind,
} from "@/lib/sitemap-xml"
import { listPublicProfileUserIds } from "@/lib/user-profile-query"

// The database-backed variants must not execute during `next build`: CI and a
// clean standalone build intentionally have no production database. Runtime
// results are cached below and invalidated by the corresponding writers.
export const dynamic = "force-dynamic"

function staticEntries(): SitemapEntry[] {
  return [
    ...localizedSitemapEntries("/", { changeFrequency: "hourly", priority: 1 }),
    ...localizedSitemapEntries("/projects", { changeFrequency: "daily", priority: 0.9 }),
    ...localizedSitemapEntries("/badge", { changeFrequency: "monthly", priority: 0.8 }),
    ...localizedSitemapEntries("/pricing", { changeFrequency: "monthly", priority: 0.9 }),
    ...localizedSitemapEntries("/categories", { changeFrequency: "weekly", priority: 0.9 }),
    ...localizedSitemapEntries("/trending", { changeFrequency: "daily", priority: 0.8 }),
    ...localizedSitemapEntries("/winners", { changeFrequency: "daily", priority: 0.8 }),
    ...localizedSitemapEntries("/blog", { changeFrequency: "weekly", priority: 0.7 }),
    ...localizedSitemapEntries("/reviews", { changeFrequency: "weekly", priority: 0.7 }),
    ...localizedSitemapEntries("/friends", { changeFrequency: "monthly", priority: 0.5 }),
    ...localizedSitemapEntries("/tags", { changeFrequency: "weekly", priority: 0.8 }),
    englishSitemapEntry("/legal", { changeFrequency: "yearly", priority: 0.2 }),
    englishSitemapEntry("/legal/privacy", { changeFrequency: "yearly", priority: 0.3 }),
    englishSitemapEntry("/legal/terms", { changeFrequency: "yearly", priority: 0.3 }),
    englishSitemapEntry("/compare", { changeFrequency: "weekly", priority: 0.8 }),
    englishSitemapEntry("/alternatives", { changeFrequency: "weekly", priority: 0.8 }),
  ]
}

async function projectSourceRowsFor(shard: number) {
  const offset = (shard - 1) * SITEMAP_SOURCE_ROWS_PER_SHARD
  return db
    .select({ slug: project.slug, updatedAt: project.updatedAt })
    .from(project)
    .where(
      or(
        eq(project.launchStatus, launchStatus.ONGOING),
        eq(project.launchStatus, launchStatus.LAUNCHED),
      ),
    )
    .orderBy(project.slug)
    .limit(SITEMAP_SOURCE_ROWS_PER_SHARD)
    .offset(offset)
}

const cachedProjectSourceRowsFor = unstable_cache(
  projectSourceRowsFor,
  ["sitemap-project-source-rows"],
  {
    revalidate: 3600,
    tags: [SITEMAP_ENTRIES_TAG],
  },
)

async function publicUserSourceRowsFor(shard: number) {
  return listPublicProfileUserIds({
    limit: SITEMAP_SOURCE_ROWS_PER_SHARD,
    offset: (shard - 1) * SITEMAP_SOURCE_ROWS_PER_SHARD,
  })
}

const cachedPublicUserSourceRowsFor = unstable_cache(
  publicUserSourceRowsFor,
  ["sitemap-public-user-source-rows"],
  {
    revalidate: 3600,
    tags: [SITEMAP_ENTRIES_TAG],
  },
)

async function entriesFor(kind: SitemapKind, shard: number): Promise<SitemapEntry[]> {
  if (kind === "static") return staticEntries()

  if (kind === "projects") {
    const projects = await cachedProjectSourceRowsFor(shard)
    return projects.flatMap((item) =>
      localizedSitemapEntries(`/projects/${item.slug}`, {
        lastModified: item.updatedAt,
        changeFrequency: "daily",
        priority: 0.8,
      }),
    )
  }

  if (kind === "tags") {
    const tags = await db
      .select({ slug: tag.slug, updatedAt: tag.updatedAt })
      .from(tag)
      .where(eq(tag.moderationStatus, tagModerationStatus.APPROVED))
    return tags.flatMap((item) =>
      localizedSitemapEntries(`/tags/${item.slug}`, {
        lastModified: item.updatedAt,
        changeFrequency: "weekly",
        priority: 0.7,
      }),
    )
  }

  if (kind === "blog") {
    // Published only — recaps land as drafts for human review and must
    // not be submitted to search engines. Translations share the source
    // slug, so hreflang alternates point at the same path per locale.
    const articles = await db
      .select({ slug: blogArticle.slug, updatedAt: blogArticle.updatedAt })
      .from(blogArticle)
      .where(eq(blogArticle.status, "published"))
    return articles.flatMap((item) =>
      localizedSitemapEntries(`/blog/${item.slug}`, {
        lastModified: item.updatedAt,
        changeFrequency: "weekly",
        priority: 0.7,
      }),
    )
  }

  if (kind === "users") {
    // Only users with at least one publicly-visible project (same
    // predicate as the profile page — no empty/banned profiles).
    const userIds = await cachedPublicUserSourceRowsFor(shard)
    return userIds.flatMap((id) =>
      localizedSitemapEntries(`/users/${id}`, {
        changeFrequency: "weekly",
        priority: 0.5,
      }),
    )
  }

  if (kind === "reviews") {
    const reviews = await db
      .select({ slug: seoArticle.slug, updatedAt: seoArticle.updatedAt })
      .from(seoArticle)
    return reviews.flatMap((item) =>
      localizedSitemapEntries(`/reviews/${item.slug}`, {
        lastModified: item.updatedAt,
        changeFrequency: "weekly",
        priority: 0.7,
      }),
    )
  }

  const [comparisons, alternatives] = await Promise.all([
    db
      .select({ slug: comparisonPage.slug, updatedAt: comparisonPage.updatedAt })
      .from(comparisonPage),
    db
      .select({ slug: alternativePage.slug, updatedAt: alternativePage.updatedAt })
      .from(alternativePage),
  ])
  return [
    ...comparisons.map((item) =>
      englishSitemapEntry(`/compare/${item.slug}`, {
        lastModified: item.updatedAt,
        changeFrequency: "weekly",
        priority: 0.7,
      }),
    ),
    ...alternatives.map((item) =>
      englishSitemapEntry(`/alternatives/${item.slug}`, {
        lastModified: item.updatedAt,
        changeFrequency: "weekly",
        priority: 0.7,
      }),
    ),
  ]
}

const cachedEntriesFor = unstable_cache(entriesFor, ["sitemap-entries"], {
  revalidate: 3600,
  tags: [SITEMAP_ENTRIES_TAG],
})

export async function GET(
  request: Request,
  { params }: { params: Promise<{ kind: string }> },
): Promise<Response> {
  const rawKind = (await params).kind
  if (rawKind === "projects.xml" || rawKind === "users.xml") {
    return Response.redirect(new URL("/sitemap.xml", request.url), 308)
  }

  const route = parseSitemapRoute(rawKind)
  if (!route) {
    return new Response("Not Found", { status: 404 })
  }

  // Sharded routes cache only their compact source rows above. Caching the
  // expanded hreflang objects would reintroduce the 2 MiB Data Cache failure
  // this split is designed to remove.
  const entries =
    route.kind === "projects" || route.kind === "users"
      ? await entriesFor(route.kind, route.shard)
      : await cachedEntriesFor(route.kind, route.shard)
  return new Response(serializeSitemap(entries), {
    headers: {
      "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
      "Content-Type": "application/xml; charset=utf-8",
    },
  })
}
