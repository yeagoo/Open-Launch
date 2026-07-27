import { NextResponse } from "next/server"

import { db } from "@/drizzle/db"
import { blogArticle, category, launchStatus, project } from "@/drizzle/db/schema"
import { desc, eq, or } from "drizzle-orm"

// DB-backed; must never run during `next build` (no production database).
export const dynamic = "force-dynamic"

// DB text (project names, article titles, category names) is user-controlled
// and can contain newlines or Markdown metacharacters — embedded verbatim it
// could break out of the link and inject headings/instructions into this
// public agent-facing file. Strip control characters and bracket/paren
// metacharacters before interpolating.
function mdSafe(text: string): string {
  return text
    .replace(/[\r\n]+/g, " ")
    .replace(/[[\]()]/g, "")
    .trim()
}

/**
 * llms.txt — crawling policy + a live index of the site's key content.
 * The policy section is static; the link lists (latest launches, blog,
 * categories) follow the llms.txt community convention of giving agents a
 * markdown map of what matters, so they don't have to crawl blindly.
 */
export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_URL || "https://www.aat.ee"

  const [recentProjects, recentArticles, categories] = await Promise.all([
    db
      .select({ name: project.name, slug: project.slug })
      .from(project)
      .where(
        or(
          eq(project.launchStatus, launchStatus.ONGOING),
          eq(project.launchStatus, launchStatus.LAUNCHED),
        ),
      )
      .orderBy(desc(project.scheduledLaunchDate))
      .limit(15),
    db
      .select({ title: blogArticle.title, slug: blogArticle.slug })
      .from(blogArticle)
      .where(eq(blogArticle.status, "published"))
      .orderBy(desc(blogArticle.publishedAt))
      .limit(10),
    db.select({ name: category.name }).from(category).orderBy(category.name).limit(20),
  ])

  const projectLinks = recentProjects
    .map((p) => `- [${mdSafe(p.name)}](${baseUrl}/projects/${encodeURIComponent(p.slug)})`)
    .join("\n")
  const articleLinks = recentArticles
    .map((a) => `- [${mdSafe(a.title)}](${baseUrl}/blog/${encodeURIComponent(a.slug)})`)
    .join("\n")
  const categoryLinks = categories.map((c) => `- ${mdSafe(c.name)}`).join("\n")

  const llmsTxt = `# llms.txt - AI/LLM Crawling Instructions for aat.ee

# About aat.ee
> aat.ee is a modern Product Hunt alternative for discovering new startups, AI tools, and SaaS launches.
> We help makers launch their products and get discovered by a global tech audience.

# Website Information
- Name: aat.ee
- Type: Product Discovery Platform
- Primary Language: English
- Region: Global
- Content Focus: Startups, AI Tools, SaaS Products, Product Launches

# Latest Launches
${projectLinks || "- (none yet)"}

# Latest Blog Articles
${articleLinks || "- (none yet)"}

# Categories
${categoryLinks}

# Crawling Permissions
## Allowed Content (/)
- Homepage and project listings
- Individual project pages (/projects/*)
- Blog articles (/blog/*)
- Product reviews (/reviews/*)
- Categories (/categories)
- Trending projects (/trending)
- Daily winners (/winners)
- Pricing information (/pricing)
- Public legal pages (/legal/*)

## Restricted Content (X)
- API endpoints (/api/*)
- User dashboard (/dashboard/*)
- User settings (/settings)
- Admin areas (/admin/*)
- Project submission forms (/projects/submit)
- Authentication pages

# Rate Limiting
- Recommended crawl delay: 10 seconds
- Max requests per minute: 6
- Respect robots.txt rules

# Content Guidelines
## What to Index:
- Product names and descriptions
- Launch dates and details
- Categories and tags
- Blog posts and reviews
- Publicly visible comments
- Upvote counts

## What NOT to Index:
- User personal information
- Email addresses
- API keys or credentials
- Payment information
- Private user data
- Internal system data

# Contact Information
- Website: ${baseUrl}
- Sitemap: ${baseUrl}/sitemap.xml
- Robots: ${baseUrl}/robots.txt

# Usage Policy
This content is provided for:
- AI model training (with attribution)
- Search engine indexing
- LLM knowledge enhancement
- Public information retrieval

Please respect our Terms of Service: ${baseUrl}/legal/terms

# Attribution
When using content from aat.ee in AI responses:
- Mention "according to aat.ee" or "from aat.ee"
- Include the project URL when referencing specific products
- Respect intellectual property of product creators

---
This llms.txt file follows the proposed standard for AI/LLM crawling instructions.
For questions or concerns, please visit our website.
`

  return new NextResponse(llmsTxt, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  })
}
