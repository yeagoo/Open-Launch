#!/usr/bin/env bun
// Seed only the 5 bilingual articles added in the 2026-07 batch.
//
// Why not `scripts/seed-blog.ts`: that script upserts EVERY content/blog/*.mdx
// file, which would bump updated_at on the 8 pre-existing articles. Those 8 have
// 56 machine translations (8 locales) whose staleness is judged as
// `translation.updated_at < article.updated_at`, so touching the articles would
// make translate-blog re-translate all of them. This run only needs the 5 new
// rows; leave the old ones exactly as they are.
//
// Pair this with scripts/seed-blog-translations.ts <locale>, which writes the
// hand-written zh text. Usage:
//   bun --preload ./scripts/preload/server-only-shim.ts scripts/seed-blog-batch.ts [--dry-run]
import { readFile } from "node:fs/promises"

import "dotenv/config"

import { eq } from "drizzle-orm"
import matter from "gray-matter"

import { db } from "../drizzle/db"
import { blogArticle } from "../drizzle/db/schema"

const BATCH = [
  "product-hunt-alternatives",
  "nobody-came-after-launch",
  "directory-submission-tracker",
  "tracking-geo-with-search-console",
  "ai-crawlers-robots-llms-txt-guide",
]

const dryRun = process.argv.includes("--dry-run")

for (const slug of BATCH) {
  const file = `content/blog/${slug}.mdx`
  const { data, content } = matter(await readFile(file, "utf8"))
  if (data.slug !== slug) {
    console.error(`✗ ${file}: frontmatter slug "${data.slug}" != "${slug}"`)
    process.exit(1)
  }

  const body = content.trim()
  const publishedAt = data.publishedAt ? new Date(data.publishedAt) : null
  if (!publishedAt || Number.isNaN(publishedAt.getTime())) {
    console.error(`✗ ${file}: invalid publishedAt "${data.publishedAt}"`)
    process.exit(1)
  }

  const [existing] = await db
    .select({ slug: blogArticle.slug, status: blogArticle.status })
    .from(blogArticle)
    .where(eq(blogArticle.slug, slug))
    .limit(1)

  console.log(
    `${dryRun ? "[dry] " : ""}${slug}: ${existing ? `update (currently ${existing.status})` : "insert"} ` +
      `publishedAt=${publishedAt.toISOString()} ${body.length} chars`,
  )
  if (dryRun) continue

  const now = new Date()
  // Never downgrade an existing published row; new rows go live as published.
  const status = existing?.status === "draft" ? "draft" : "published"
  const values = {
    title: data.title,
    description: data.description,
    content: body,
    image: data.image ?? null,
    tags: Array.isArray(data.tags) ? data.tags : null,
    author: data.author ?? "aat.ee Team",
    status,
    metaTitle: data.metaTitle ?? null,
    metaDescription: data.metaDescription ?? null,
    updatedAt: now,
  }

  await db
    .insert(blogArticle)
    .values({ id: `blog-${slug}`, slug, publishedAt, ...values })
    .onConflictDoUpdate({ target: blogArticle.slug, set: values })
}

console.log(
  dryRun ? "\nDry run complete. Nothing written." : `\n✓ Seeded ${BATCH.length} article(s).`,
)
process.exit(0)
