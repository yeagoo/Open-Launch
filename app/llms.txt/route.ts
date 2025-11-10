import { NextResponse } from "next/server"

export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_URL || "https://www.aat.ee"

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

# Last Updated
${new Date().toISOString().split("T")[0]}

# Additional Resources
- Full sitemap: ${baseUrl}/sitemap.xml
- API documentation: Contact via website
- Data licensing: See Terms of Service

---
This llms.txt file follows the proposed standard for AI/LLM crawling instructions.
For questions or concerns, please visit our website.
`

  return new NextResponse(llmsTxt, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
    },
  })
}
