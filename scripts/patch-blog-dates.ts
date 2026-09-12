#!/usr/bin/env bun
// Re-align published_at on already-seeded articles when their frontmatter dates
// change, WITHOUT touching updated_at.
//
// Why a dedicated script rather than re-seeding: translate-blog treats a
// translation as stale when `translation.updated_at < article.updated_at`. A
// re-seed bumps the article's updated_at, which makes every existing translation
// of that article look stale and queues the whole locale set for re-translation.
// A date fix must therefore leave updated_at alone.
//
// Usage:
//   bun --preload ./scripts/preload/server-only-shim.ts scripts/patch-blog-dates.ts [--dry-run]
import { readdir, readFile } from "node:fs/promises"

import "dotenv/config"

import { eq } from "drizzle-orm"
import matter from "gray-matter"

import { db } from "../drizzle/db"
import { blogArticle } from "../drizzle/db/schema"

const dryRun = process.argv.includes("--dry-run")

const files = (await readdir("content/blog")).filter((f) => f.endsWith(".mdx"))

let changed = 0
for (const file of files) {
  const { data } = matter(await readFile(`content/blog/${file}`, "utf8"))
  const slug = data.slug as string
  const wanted = new Date(data.publishedAt)
  if (!slug || Number.isNaN(wanted.getTime())) {
    console.warn(`⚠ skip ${file}: missing slug or invalid publishedAt`)
    continue
  }

  const [row] = await db
    .select({ publishedAt: blogArticle.publishedAt })
    .from(blogArticle)
    .where(eq(blogArticle.slug, slug))
    .limit(1)
  if (!row) continue

  if (row.publishedAt.getTime() === wanted.getTime()) continue

  console.log(
    `${dryRun ? "[dry] " : ""}${slug}: ${row.publishedAt.toISOString()} -> ${wanted.toISOString()}`,
  )
  if (dryRun) continue

  // Intentionally only publishedAt: updated_at stays put so translations are
  // not marked stale.
  await db.update(blogArticle).set({ publishedAt: wanted }).where(eq(blogArticle.slug, slug))
  changed++
}

console.log(
  dryRun
    ? "\nDry run complete. Nothing written."
    : changed === 0
      ? "\n✓ All published_at values already match frontmatter."
      : `\n✓ Re-aligned published_at on ${changed} article(s). updated_at untouched.`,
)
process.exit(0)
