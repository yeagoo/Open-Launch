import { NextResponse } from "next/server"

import { db } from "@/drizzle/db"
import { blogArticle, launchStatus, project } from "@/drizzle/db/schema"
import { desc, eq, or } from "drizzle-orm"

const baseUrl = process.env.NEXT_PUBLIC_URL || "https://www.aat.ee"

export const dynamic = "force-dynamic"
export const revalidate = 3600 // Revalidate every 1 hour

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim()
}

export async function GET() {
  try {
    // Fetch published blog articles
    const articles = await db
      .select({
        id: blogArticle.id,
        title: blogArticle.title,
        slug: blogArticle.slug,
        description: blogArticle.description,
        content: blogArticle.content,
        publishedAt: blogArticle.publishedAt,
        updatedAt: blogArticle.updatedAt,
      })
      .from(blogArticle)
      .orderBy(desc(blogArticle.publishedAt))
      .limit(20)

    // Fetch launched and ongoing projects
    const projects = await db
      .select({
        id: project.id,
        name: project.name,
        slug: project.slug,
        description: project.description,
        logoUrl: project.logoUrl,
        scheduledLaunchDate: project.scheduledLaunchDate,
        createdAt: project.createdAt,
      })
      .from(project)
      .where(
        or(
          eq(project.launchStatus, launchStatus.ONGOING),
          eq(project.launchStatus, launchStatus.LAUNCHED),
        ),
      )
      .orderBy(desc(project.scheduledLaunchDate))
      .limit(20)

    const rssItems: Array<{
      title: string
      link: string
      description: string
      pubDate: Date
      type: "blog" | "project"
    }> = []

    // Add blog articles to RSS items
    articles.forEach((article) => {
      if (article.publishedAt) {
        rssItems.push({
          title: article.title,
          link: `${baseUrl}/blog/${article.slug}`,
          description: article.description || stripHtml(article.content).substring(0, 200),
          pubDate: article.publishedAt,
          type: "blog",
        })
      }
    })

    // Add projects to RSS items
    projects.forEach((proj) => {
      if (proj.scheduledLaunchDate) {
        rssItems.push({
          title: proj.name,
          link: `${baseUrl}/projects/${proj.slug}`,
          description: stripHtml(proj.description),
          pubDate: proj.scheduledLaunchDate,
          type: "project",
        })
      }
    })

    // Sort all items by pubDate (newest first)
    rssItems.sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime())

    // Generate RSS XML
    const rssXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>aat.ee - Latest Products &amp; Articles</title>
    <link>${baseUrl}</link>
    <description>Discover the latest startups, AI tools, and SaaS launches on aat.ee — the modern Product Hunt alternative</description>
    <language>en</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${baseUrl}/feed.xml" rel="self" type="application/rss+xml"/>
    
    ${rssItems
      .map(
        (item) => `
    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${item.link}</link>
      <description>${escapeXml(item.description)}</description>
      <pubDate>${item.pubDate.toUTCString()}</pubDate>
      <guid isPermaLink="true">${item.link}</guid>
      <category>${item.type === "blog" ? "Blog" : "Product Launch"}</category>
    </item>`,
      )
      .join("")}
  </channel>
</rss>`

    return new NextResponse(rssXml, {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
      },
    })
  } catch (error) {
    console.error("❌ RSS Feed generation error:", error)
    return new NextResponse("Error generating RSS feed", { status: 500 })
  }
}
