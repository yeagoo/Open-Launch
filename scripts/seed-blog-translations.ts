#!/usr/bin/env bun
// Seed/refresh DB blog TRANSLATIONS from content/blog/<locale>/*.mdx files.
//
// The English source of truth is content/blog/*.mdx → `blog_article` (see
// scripts/seed-blog.ts). Hand-written translations live one directory deeper,
// in content/blog/<locale>/, and land in `blog_article_translation` — the same
// table the translate-blog cron fills with machine translations.
//
// Why this exists: the cron overwrites any translation older than its English
// source, so a hand-written translation must be written with updated_at >= the
// article's updated_at or it gets clobbered on the next run. This script sets
// exactly that, then the cron leaves it alone (see the staleness check in
// app/api/cron/translate-blog/route.ts).
//
// Frontmatter fields: slug, title, description (required); locale, metaTitle,
// metaDescription, publishedAt (optional). `locale` may also come from the
// directory name. Body = the translated MDX content.
//
// Usage:
//   bun scripts/seed-blog-translations.ts              upsert every locale dir
//   bun scripts/seed-blog-translations.ts --dry-run     list what would change
//   bun scripts/seed-blog-translations.ts zh            only this locale
//
// NOTE: writes to whatever DATABASE_URL points at (prod). Use --dry-run first.
import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"

import "dotenv/config"

import { eq } from "drizzle-orm"
import matter from "gray-matter"

import { db } from "../drizzle/db"
import { blogArticle, blogArticleTranslation } from "../drizzle/db/schema"
import { routing } from "../i18n/routing"

const DIR = "content/blog"
const dryRun = process.argv.includes("--dry-run")
const localeArg = process.argv.slice(2).find((a) => !a.startsWith("--"))

// Every locale that has a directory in content/blog/ and is a real site locale.
// English is excluded: it is the source, not a translation.
const translatableLocales = routing.locales.filter((l) => l !== routing.defaultLocale)

async function localeDirs(): Promise<string[]> {
  const entries = await readdir(DIR, { withFileTypes: true })
  const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name)
  const unknown = dirs.filter((d) => !translatableLocales.includes(d as never))
  for (const d of unknown) {
    console.warn(
      `⚠ skip content/blog/${d}/: not a translatable locale (${translatableLocales.join(", ")})`,
    )
  }
  const known = dirs.filter((d) => translatableLocales.includes(d as never))
  return localeArg ? known.filter((d) => d === localeArg) : known
}

async function main() {
  const dirs = await localeDirs()
  if (dirs.length === 0) {
    console.log(
      localeArg
        ? `No translations to seed for locale "${localeArg}" (expected content/blog/${localeArg}/).`
        : "No translation directories found under content/blog/.",
    )
    return
  }

  let upserted = 0
  let skipped = 0

  for (const locale of dirs) {
    const dir = join(DIR, locale)
    const files = (await readdir(dir)).filter((f) => f.endsWith(".mdx"))
    if (files.length === 0) {
      console.log(`(no .mdx files in ${dir}/)`)
      continue
    }

    for (const file of files) {
      const path = join(dir, file)
      const { data, content } = matter(await readFile(path, "utf8"))
      const slug = data.slug
      if (!slug || !data.title || !data.description) {
        console.warn(`⚠ skip ${path}: needs slug + title + description in frontmatter`)
        skipped++
        continue
      }

      // The English row must exist first: the blog page merges a translation
      // over the article, so an orphan translation would never render, and the
      // cron's staleness check has nothing to compare against.
      const [article] = await db
        .select({ slug: blogArticle.slug, updatedAt: blogArticle.updatedAt })
        .from(blogArticle)
        .where(eq(blogArticle.slug, slug))
        .limit(1)
      if (!article) {
        console.warn(
          `⚠ skip ${path}: no blog_article row for slug "${slug}" — run scripts/seed-blog.ts first`,
        )
        skipped++
        continue
      }

      const body = content.trim()
      console.log(`${dryRun ? "[dry] " : ""}${path} → ${slug} [${locale}] (${body.length} chars)`)
      if (dryRun) continue

      const now = new Date()
      // updated_at = max(now, article.updated_at): the translation is at least as
      // fresh as its source, so the translate-blog cron treats it as current
      // instead of re-translating the article and discarding this hand-written
      // version. (The comparison is `existingAt < article.updatedAt`.)
      const updatedAt = new Date(Math.max(now.getTime(), article.updatedAt.getTime()))
      const values = {
        slug,
        locale,
        title: data.title,
        description: data.description,
        content: body,
        metaTitle: data.metaTitle ?? null,
        metaDescription: data.metaDescription ?? null,
        updatedAt,
      }

      await db
        .insert(blogArticleTranslation)
        .values({ ...values, createdAt: now })
        .onConflictDoUpdate({
          target: [blogArticleTranslation.slug, blogArticleTranslation.locale],
          set: values,
        })
      upserted++
    }
  }

  if (dryRun) {
    console.log("\nDry run complete. Nothing written.")
  } else {
    console.log(`✓ Upserted ${upserted} translation(s)${skipped ? `, skipped ${skipped}` : ""}.`)
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
