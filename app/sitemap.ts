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

interface LocalizedOptions {
  lastModified?: Date
  changeFrequency?: MetadataRoute.Sitemap[number]["changeFrequency"]
  priority?: number
}

// Emit one <url> per locale, each with the full set of hreflang alternates including itself.
// This is the structure Google recommends for hreflang sitemaps.
function localizedEntries(pathname: string, options: LocalizedOptions = {}): MetadataRoute.Sitemap {
  const path = pathname === "/" ? "" : pathname
  const languages: Record<string, string> = {}
  for (const loc of routing.locales) {
    languages[loc] =
      loc === routing.defaultLocale ? `${baseUrl}${path || "/"}` : `${baseUrl}/${loc}${path}`
  }
  languages["x-default"] = `${baseUrl}${path || "/"}`

  return routing.locales.map((loc) => ({
    url: languages[loc],
    lastModified: options.lastModified ?? new Date(),
    changeFrequency: options.changeFrequency,
    priority: options.priority,
    alternates: { languages },
  }))
}

function englishOnlyEntry(
  pathname: string,
  options: LocalizedOptions = {},
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
    .select({ slug: project.slug, updatedAt: project.updatedAt })
    .from(project)
    .where(
      or(
        eq(project.launchStatus, launchStatus.ONGOING),
        eq(project.launchStatus, launchStatus.LAUNCHED),
      ),
    )

  const projectUrls = projects.flatMap((proj) =>
    localizedEntries(`/projects/${proj.slug}`, {
      lastModified: proj.updatedAt,
      changeFrequency: "daily",
      priority: 0.8,
    }),
  )

  const staticPages: MetadataRoute.Sitemap = [
    ...localizedEntries("/", { changeFrequency: "hourly", priority: 1.0 }),
    ...localizedEntries("/projects", { changeFrequency: "daily", priority: 0.9 }),
    ...localizedEntries("/badge", { changeFrequency: "monthly", priority: 0.8 }),
    ...localizedEntries("/pricing", { changeFrequency: "monthly", priority: 0.9 }),
    ...localizedEntries("/categories", { changeFrequency: "weekly", priority: 0.9 }),
    ...localizedEntries("/trending", { changeFrequency: "daily", priority: 0.8 }),
    ...localizedEntries("/winners", { changeFrequency: "daily", priority: 0.8 }),
    ...localizedEntries("/blog", { changeFrequency: "weekly", priority: 0.7 }),
    ...localizedEntries("/reviews", { changeFrequency: "weekly", priority: 0.7 }),
    // /sponsors and /pricing/directories both 308-redirect into
    // /pricing (the consolidated pricing hub). Redirected URLs
    // don't belong in the sitemap — crawlers will discover them
    // via the canonical /pricing entry above.
    ...localizedEntries("/friends", { changeFrequency: "monthly", priority: 0.5 }),
    // Legal docs are English-only — translating them carries liability, so
    // we don't emit hreflang sitemap entries for them either.
    englishOnlyEntry("/legal", { changeFrequency: "yearly", priority: 0.2 }),
    englishOnlyEntry("/legal/privacy", { changeFrequency: "yearly", priority: 0.3 }),
    englishOnlyEntry("/legal/terms", { changeFrequency: "yearly", priority: 0.3 }),
    ...localizedEntries("/tags", { changeFrequency: "weekly", priority: 0.8 }),
  ]

  const tags = await db
    .select({ slug: tag.slug, updatedAt: tag.updatedAt })
    .from(tag)
    .where(eq(tag.moderationStatus, tagModerationStatus.APPROVED))

  const tagUrls = tags.flatMap((t) =>
    localizedEntries(`/tags/${t.slug}`, {
      lastModified: t.updatedAt,
      changeFrequency: "weekly",
      priority: 0.7,
    }),
  )

  const comparisons = await db
    .select({ slug: comparisonPage.slug, updatedAt: comparisonPage.updatedAt })
    .from(comparisonPage)

  const comparisonUrls = comparisons.map((c) =>
    englishOnlyEntry(`/compare/${c.slug}`, {
      lastModified: c.updatedAt,
      changeFrequency: "weekly",
      priority: 0.7,
    }),
  )

  const alternatives = await db
    .select({ slug: alternativePage.slug, updatedAt: alternativePage.updatedAt })
    .from(alternativePage)

  const alternativeUrls = alternatives.map((a) =>
    englishOnlyEntry(`/alternatives/${a.slug}`, {
      lastModified: a.updatedAt,
      changeFrequency: "weekly",
      priority: 0.7,
    }),
  )

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
