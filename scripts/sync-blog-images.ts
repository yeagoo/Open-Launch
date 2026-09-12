#!/usr/bin/env bun
// Sync blog cover paths from content/blog/*.mdx to blog_article.image without
// touching updated_at. Re-seeding an existing article would make its
// translations look stale and can trigger unwanted machine re-translation.
import { access, readdir, readFile } from "node:fs/promises"
import { resolve } from "node:path"

import "dotenv/config"

import { eq } from "drizzle-orm"
import matter from "gray-matter"

import { db } from "../drizzle/db"
import { blogArticle } from "../drizzle/db/schema"

const CONTENT_DIRECTORY = "content/blog"
const COVER_PATH_PREFIX = "/images/blog-covers/"
const dryRun = process.argv.includes("--dry-run")

const files = (await readdir(CONTENT_DIRECTORY, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && entry.name.endsWith(".mdx"))
  .map((entry) => entry.name)
  .sort()

let updated = 0
let unchanged = 0
const errors: string[] = []

for (const file of files) {
  const path = resolve(CONTENT_DIRECTORY, file)
  const { data } = matter(await readFile(path, "utf8"))
  const slug = typeof data.slug === "string" ? data.slug : ""
  const image = typeof data.image === "string" ? data.image : ""

  if (!slug || !image) {
    errors.push(file + ": requires slug and image frontmatter")
    continue
  }
  if (!image.startsWith(COVER_PATH_PREFIX) || !image.endsWith(".webp") || image.includes("..")) {
    errors.push(file + ": invalid local cover path " + JSON.stringify(image))
    continue
  }

  try {
    await access(resolve("public", image.slice(1)))
  } catch {
    errors.push(file + ": missing cover asset " + image)
    continue
  }

  const [article] = await db
    .select({ image: blogArticle.image })
    .from(blogArticle)
    .where(eq(blogArticle.slug, slug))
    .limit(1)
  if (!article) {
    errors.push(file + ": no blog_article row for slug " + JSON.stringify(slug))
    continue
  }

  if (article.image === image) {
    unchanged++
    continue
  }

  console.log((dryRun ? "[dry] " : "") + slug + ": " + (article.image ?? "(none)") + " -> " + image)
  if (dryRun) continue

  // Do not add updatedAt here. The translate-blog cron uses it to decide
  // whether a human translation should be overwritten.
  await db.update(blogArticle).set({ image }).where(eq(blogArticle.slug, slug))
  updated++
}

if (errors.length > 0) {
  console.error("Blog cover sync failed:")
  for (const error of errors) console.error("- " + error)
  process.exit(1)
}

console.log(
  dryRun
    ? "Dry run complete. Nothing written."
    : "Synced " + updated + " cover image(s); " + unchanged + " already matched.",
)
process.exit(0)
