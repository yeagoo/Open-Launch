import { unstable_cache } from "next/cache"

import { db } from "@/drizzle/db"
import {
  alternativePage,
  comparisonPage,
  launchStatus,
  project,
  tag,
  tagModerationStatus,
} from "@/drizzle/db/schema"
import { eq, or } from "drizzle-orm"

import { SITEMAP_ENTRIES_TAG } from "@/lib/cache-tags"
import {
  englishSitemapEntry,
  localizedSitemapEntries,
  serializeSitemap,
  SITEMAP_KINDS,
  type SitemapEntry,
  type SitemapKind,
} from "@/lib/sitemap-xml"

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

async function entriesFor(kind: SitemapKind): Promise<SitemapEntry[]> {
  if (kind === "static") return staticEntries()

  if (kind === "projects") {
    const projects = await db
      .select({ slug: project.slug, updatedAt: project.updatedAt })
      .from(project)
      .where(
        or(
          eq(project.launchStatus, launchStatus.ONGOING),
          eq(project.launchStatus, launchStatus.LAUNCHED),
        ),
      )
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
  _request: Request,
  { params }: { params: Promise<{ kind: string }> },
): Promise<Response> {
  const rawKind = (await params).kind
  const kind = rawKind.endsWith(".xml") ? rawKind.slice(0, -4) : ""
  if (!SITEMAP_KINDS.includes(kind as SitemapKind)) {
    return new Response("Not Found", { status: 404 })
  }

  const entries = await cachedEntriesFor(kind as SitemapKind)
  return new Response(serializeSitemap(entries), {
    headers: {
      "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
      "Content-Type": "application/xml; charset=utf-8",
    },
  })
}
