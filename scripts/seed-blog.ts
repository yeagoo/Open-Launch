#!/usr/bin/env bun
// Seed/refresh DB blog articles from content/blog/*.mdx files.
//
// The blog stores articles in the `blog_article` table (rendered via MDXRemote),
// but there's no admin UI — so we author posts as MDX files with frontmatter and
// upsert them here. Idempotent on `slug`, so re-running updates in place.
//
// Frontmatter fields: slug, title, description (required); tags, author, image,
// metaTitle, metaDescription, publishedAt (optional). Body = the MDX content.
//
// Usage:
//   bun scripts/seed-blog.ts            upsert every content/blog/*.mdx
//   bun scripts/seed-blog.ts --dry-run  list what would change, write nothing
//
// NOTE: writes to whatever DATABASE_URL points at (prod). Use --dry-run first.
import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"

import "dotenv/config"

import matter from "gray-matter"

import { db } from "../drizzle/db"
import { blogArticle } from "../drizzle/db/schema"

const DIR = "content/blog"
const dryRun = process.argv.includes("--dry-run")

async function main() {
  const files = (await readdir(DIR)).filter((f) => f.endsWith(".mdx"))
  if (files.length === 0) {
    console.log(`No .mdx files in ${DIR}/`)
    return
  }

  let upserted = 0
  for (const file of files) {
    const { data, content } = matter(await readFile(join(DIR, file), "utf8"))
    const slug = data.slug
    if (!slug || !data.title || !data.description) {
      console.warn(`⚠ skip ${file}: needs slug + title + description in frontmatter`)
      continue
    }

    const body = content.trim()
    console.log(`${dryRun ? "[dry] " : ""}${file} → /blog/${slug} (${body.length} chars)`)
    if (dryRun) continue

    const now = new Date()
    const status = data.status === "draft" ? "draft" : "published"
    // Only set publishedAt from frontmatter. On a reseed (conflict) WITHOUT an
    // explicit date, preserve the existing published_at so re-running to refresh
    // content doesn't reshuffle blog ordering / RSS dates.
    const explicitPublishedAt = data.publishedAt ? new Date(data.publishedAt) : null
    const updateSet = {
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
      ...(explicitPublishedAt ? { publishedAt: explicitPublishedAt } : {}),
    }
    await db
      .insert(blogArticle)
      .values({
        id: `blog-${slug}`,
        slug,
        title: data.title,
        description: data.description,
        content: body,
        image: data.image ?? null,
        tags: Array.isArray(data.tags) ? data.tags : null,
        author: data.author ?? "aat.ee Team",
        status,
        metaTitle: data.metaTitle ?? null,
        metaDescription: data.metaDescription ?? null,
        publishedAt: explicitPublishedAt ?? now,
      })
      .onConflictDoUpdate({ target: blogArticle.slug, set: updateSet })
    upserted++
  }
  console.log(dryRun ? "Dry run complete." : `✓ Upserted ${upserted} article(s).`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
