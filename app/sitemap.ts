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
import { eq, or } from "drizzle-orm"

const baseUrl = process.env.NEXT_PUBLIC_URL || "https://www.aat.ee"

// 标记为动态生成，不在构建时预渲染
export const dynamic = "force-dynamic"
export const revalidate = 3600 // 重新验证间隔：1小时

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // 获取所有已上架的项目（ONGOING 或 LAUNCHED）
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

  // 项目页面
  const projectUrls: MetadataRoute.Sitemap = projects.map((proj) => ({
    url: `${baseUrl}/projects/${proj.slug}`,
    lastModified: proj.updatedAt,
    changeFrequency: "daily",
    priority: 0.8,
  }))

  // 静态页面
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: "hourly",
      priority: 1.0,
    },
    {
      url: `${baseUrl}/projects`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/badge`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/pricing`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/categories`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/trending`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/winners`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/blog`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/reviews`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/sponsors`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${baseUrl}/legal/privacy`,
      lastModified: new Date(),
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${baseUrl}/legal/terms`,
      lastModified: new Date(),
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ]

  // Tags
  const tags = await db
    .select({ slug: tag.slug, updatedAt: tag.updatedAt })
    .from(tag)
    .where(eq(tag.moderationStatus, tagModerationStatus.APPROVED))

  const tagUrls: MetadataRoute.Sitemap = tags.map((t) => ({
    url: `${baseUrl}/tags/${t.slug}`,
    lastModified: t.updatedAt,
    changeFrequency: "weekly",
    priority: 0.7,
  }))

  // Comparison pages
  const comparisons = await db
    .select({ slug: comparisonPage.slug, updatedAt: comparisonPage.updatedAt })
    .from(comparisonPage)

  const comparisonUrls: MetadataRoute.Sitemap = comparisons.map((c) => ({
    url: `${baseUrl}/compare/${c.slug}`,
    lastModified: c.updatedAt,
    changeFrequency: "weekly",
    priority: 0.7,
  }))

  // Alternative pages
  const alternatives = await db
    .select({ slug: alternativePage.slug, updatedAt: alternativePage.updatedAt })
    .from(alternativePage)

  const alternativeUrls: MetadataRoute.Sitemap = alternatives.map((a) => ({
    url: `${baseUrl}/alternatives/${a.slug}`,
    lastModified: a.updatedAt,
    changeFrequency: "weekly",
    priority: 0.7,
  }))

  // Static pages for new sections
  const newStaticPages: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}/tags`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/compare`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/alternatives`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
  ]

  return [
    ...staticPages,
    ...newStaticPages,
    ...projectUrls,
    ...tagUrls,
    ...comparisonUrls,
    ...alternativeUrls,
  ]
}
