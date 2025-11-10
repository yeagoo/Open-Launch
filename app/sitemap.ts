import { MetadataRoute } from "next"

import { db } from "@/drizzle/db"
import { launchStatus, project } from "@/drizzle/db/schema"
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

  return [...staticPages, ...projectUrls]
}
