import { MetadataRoute } from "next"

import { db } from "@/drizzle/db"
import {
  alternativePage,
  comparisonPage,
  launchStatus,
  project,
  tag,
  tagModerationStatus,
} from "@/drizzle/db/schema"
import { routing } from "@/i18n/routing"
import { eq, or } from "drizzle-orm"

const baseUrl = process.env.NEXT_PUBLIC_URL || "https://www.aat.ee"

export const dynamic = "force-dynamic"
export const revalidate = 3600

// Build a sitemap entry that includes hreflang alternates for every supported locale.
// English (default) is at /path; others at /<locale>/path.
function localizedEntry(
  pathname: string,
  options: {
    lastModified?: Date
    changeFrequency?: MetadataRoute.Sitemap[number]["changeFrequency"]
    priority?: number
  } = {},
): MetadataRoute.Sitemap[number] {
  const path = pathname === "/" ? "" : pathname
  const languages: Record<string, string> = {}
  for (const locale of routing.locales) {
    const url =
      locale === routing.defaultLocale ? `${baseUrl}${path}` : `${baseUrl}/${locale}${path}`
    languages[locale] = url
  }
  languages["x-default"] = `${baseUrl}${path}`

  return {
    url: `${baseUrl}${path}`,
    lastModified: options.lastModified ?? new Date(),
    changeFrequency: options.changeFrequency,
    priority: options.priority,
    alternates: { languages },
  }
}

// English-only entry (compare/alternatives are not localized)
function englishOnlyEntry(
  pathname: string,
  options: {
    lastModified?: Date
    changeFrequency?: MetadataRoute.Sitemap[number]["changeFrequency"]
    priority?: number
  } = {},
): MetadataRoute.Sitemap[number] {
  return {
    url: `${baseUrl}${pathname === "/" ? "" : pathname}`,
    lastModified: options.lastModified ?? new Date(),
    changeFrequency: options.changeFrequency,
    priority: options.priority,
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const projects = await db
    .select({
      slug: project.slug,
      updatedAt: project.updatedAt,
    })
    .from(project)
    .where(
      or(
        eq(project.launchStatus, launchStatus.ONGOING),
        eq(project.launchStatus, launchStatus.LAUNCHED),
      ),
    )

  const projectUrls: MetadataRoute.Sitemap = projects.map((proj) =>
    localizedEntry(`/projects/${proj.slug}`, {
      lastModified: proj.updatedAt,
      changeFrequency: "daily",
      priority: 0.8,
    }),
  )

  const staticPages: MetadataRoute.Sitemap = [
    localizedEntry("/", { changeFrequency: "hourly", priority: 1.0 }),
    localizedEntry("/projects", { changeFrequency: "daily", priority: 0.9 }),
    localizedEntry("/badge", { changeFrequency: "monthly", priority: 0.8 }),
    localizedEntry("/pricing", { changeFrequency: "monthly", priority: 0.9 }),
    localizedEntry("/categories", { changeFrequency: "weekly", priority: 0.9 }),
    localizedEntry("/trending", { changeFrequency: "daily", priority: 0.8 }),
    localizedEntry("/winners", { changeFrequency: "daily", priority: 0.8 }),
    localizedEntry("/blog", { changeFrequency: "weekly", priority: 0.7 }),
    localizedEntry("/reviews", { changeFrequency: "weekly", priority: 0.7 }),
    localizedEntry("/sponsors", { changeFrequency: "monthly", priority: 0.6 }),
    localizedEntry("/friends", { changeFrequency: "monthly", priority: 0.5 }),
    localizedEntry("/legal/privacy", { changeFrequency: "yearly", priority: 0.3 }),
    localizedEntry("/legal/terms", { changeFrequency: "yearly", priority: 0.3 }),
    localizedEntry("/tags", { changeFrequency: "weekly", priority: 0.8 }),
  ]

  const tags = await db
    .select({ slug: tag.slug, updatedAt: tag.updatedAt })
    .from(tag)
    .where(eq(tag.moderationStatus, tagModerationStatus.APPROVED))

  const tagUrls: MetadataRoute.Sitemap = tags.map((t) =>
    localizedEntry(`/tags/${t.slug}`, {
      lastModified: t.updatedAt,
      changeFrequency: "weekly",
      priority: 0.7,
    }),
  )

  const comparisons = await db
    .select({ slug: comparisonPage.slug, updatedAt: comparisonPage.updatedAt })
    .from(comparisonPage)

  const comparisonUrls: MetadataRoute.Sitemap = comparisons.map((c) =>
    englishOnlyEntry(`/compare/${c.slug}`, {
      lastModified: c.updatedAt,
      changeFrequency: "weekly",
      priority: 0.7,
    }),
  )

  const alternatives = await db
    .select({ slug: alternativePage.slug, updatedAt: alternativePage.updatedAt })
    .from(alternativePage)

  const alternativeUrls: MetadataRoute.Sitemap = alternatives.map((a) =>
    englishOnlyEntry(`/alternatives/${a.slug}`, {
      lastModified: a.updatedAt,
      changeFrequency: "weekly",
      priority: 0.7,
    }),
  )

  // English-only listing pages for the AI sections
  const englishOnlyPages: MetadataRoute.Sitemap = [
    englishOnlyEntry("/compare", { changeFrequency: "weekly", priority: 0.8 }),
    englishOnlyEntry("/alternatives", { changeFrequency: "weekly", priority: 0.8 }),
  ]

  return [
    ...staticPages,
    ...englishOnlyPages,
    ...projectUrls,
    ...tagUrls,
    ...comparisonUrls,
    ...alternativeUrls,
  ]
}
