#!/usr/bin/env bun
// Publish a draft blog article (e.g. an auto-generated launch recap) after
// review. Flips status to 'published' so it appears in the list + RSS feed.
//
// Usage:
//   bun scripts/publish-blog.ts <slug>            publish now
//   bun scripts/publish-blog.ts <slug> --at <iso> publish with a specific date
import "dotenv/config"

import { eq } from "drizzle-orm"

import { db } from "../drizzle/db"
import { blogArticle } from "../drizzle/db/schema"

async function main() {
  const slug = process.argv[2]
  if (!slug || slug.startsWith("--")) {
    console.error("usage: bun scripts/publish-blog.ts <slug> [--at <iso-date>]")
    process.exit(1)
  }
  const atIdx = process.argv.indexOf("--at")
  const publishedAt =
    atIdx >= 0 && process.argv[atIdx + 1] ? new Date(process.argv[atIdx + 1]) : new Date()

  const res = await db
    .update(blogArticle)
    .set({ status: "published", publishedAt, updatedAt: new Date() })
    .where(eq(blogArticle.slug, slug))
    .returning({ slug: blogArticle.slug })
  if (res.length === 0) {
    console.error(`No article with slug "${slug}".`)
    process.exit(1)
  }
  console.log(`✓ Published /blog/${slug} (publishedAt ${publishedAt.toISOString()})`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
