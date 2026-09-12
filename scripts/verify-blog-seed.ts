import "dotenv/config"

import { desc, eq } from "drizzle-orm"

import { db } from "../drizzle/db"
import { blogArticle, blogArticleTranslation } from "../drizzle/db/schema"

const articles = await db
  .select({
    slug: blogArticle.slug,
    title: blogArticle.title,
    status: blogArticle.status,
    image: blogArticle.image,
    publishedAt: blogArticle.publishedAt,
    updatedAt: blogArticle.updatedAt,
  })
  .from(blogArticle)
  .where(eq(blogArticle.status, "published"))
  .orderBy(desc(blogArticle.publishedAt))

console.log("== published blog_article rows ==")
for (const a of articles) {
  console.log(
    `${a.status.padEnd(9)} ${a.publishedAt.toISOString().slice(0, 10)}  ${a.slug}${a.image ? "" : "  MISSING COVER"}`,
  )
}

const zh = await db
  .select({
    slug: blogArticleTranslation.slug,
    locale: blogArticleTranslation.locale,
    title: blogArticleTranslation.title,
    updatedAt: blogArticleTranslation.updatedAt,
  })
  .from(blogArticleTranslation)
  .where(eq(blogArticleTranslation.locale, "zh"))

console.log(`\n== zh translations: ${zh.length} ==`)
for (const t of zh) {
  console.log(`${t.updatedAt.toISOString().slice(0, 19)}  ${t.slug}  ::  ${t.title.slice(0, 40)}`)
}

// The translate-blog cron re-translates when existingAt < article.updatedAt.
// Confirm no zh translation is older than its English source.
const stale: string[] = []
for (const t of zh) {
  const [a] = await db
    .select({ updatedAt: blogArticle.updatedAt })
    .from(blogArticle)
    .where(eq(blogArticle.slug, t.slug))
    .limit(1)
  if (a && t.updatedAt < a.updatedAt) stale.push(t.slug)
}
const missingCovers = articles.filter((article) => !article.image).map((article) => article.slug)

if (missingCovers.length > 0) {
  console.error(`\nMISSING COVERS: ${missingCovers.join(", ")}`)
}
if (stale.length > 0) {
  console.error(`\nSTALE (cron would re-translate): ${stale.join(", ")}`)
}
if (missingCovers.length > 0 || stale.length > 0) process.exit(1)

console.log(
  "\nOK: every published article has a cover and no zh translation is older than its English source.",
)
process.exit(0)
