import { NextRequest, NextResponse } from "next/server"

import { db } from "@/drizzle/db"
import { blogArticle, blogArticleTranslation } from "@/drizzle/db/schema"
import { routing } from "@/i18n/routing"
import { eq } from "drizzle-orm"
import { serialize } from "next-mdx-remote/serialize"
import remarkGfm from "remark-gfm"

import { verifyCronAuth } from "@/lib/cron-auth"
import { cronStatusFromResult } from "@/lib/cron-status"
import { translateBlogArticle, type BlogLocale } from "@/lib/translate-blog"

export const dynamic = "force-dynamic"
export const maxDuration = 300

// Article-locale pairs translated per run (each = up to 5 DeepSeek calls).
// Bounded so a run stays well inside maxDuration; backfill spreads over runs.
const PAIRS_PER_RUN = 10

// Auto-published translations skip the draft review the generation crons use, so
// reject MDX that does not compile (the article page would otherwise throw or
// render a fenced document for that locale). Throws → caught → pair skipped →
// page falls back to English until a later run produces valid MDX.
async function assertCompiles(content: string): Promise<void> {
  if (!content.trim()) throw new Error("empty translated content")
  await serialize(content, { mdxOptions: { remarkPlugins: [remarkGfm] } })
}

/**
 * Translate published English blog articles into every other locale. Each run
 * fills the missing or stale (article, locale) translations and stores them in
 * blog_article_translation. Source of truth stays the English blog_article row;
 * the blog pages merge a translation over it and fall back to English.
 */
export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request)
  if (authError) return authError

  const targets = routing.locales.filter((l): l is BlogLocale => l !== "en")

  try {
    const articles = await db
      .select({
        slug: blogArticle.slug,
        title: blogArticle.title,
        description: blogArticle.description,
        content: blogArticle.content,
        metaTitle: blogArticle.metaTitle,
        metaDescription: blogArticle.metaDescription,
        updatedAt: blogArticle.updatedAt,
      })
      .from(blogArticle)
      .where(eq(blogArticle.status, "published"))

    const existing = await db
      .select({
        slug: blogArticleTranslation.slug,
        locale: blogArticleTranslation.locale,
        updatedAt: blogArticleTranslation.updatedAt,
      })
      .from(blogArticleTranslation)
    const existingAt = new Map(existing.map((e) => [`${e.slug}:${e.locale}`, e.updatedAt]))

    // Work = (article, locale) pairs with no translation, or one older than the
    // English source (re-translate after an edit).
    const work: { article: (typeof articles)[number]; locale: BlogLocale }[] = []
    for (const article of articles) {
      for (const locale of targets) {
        const at = existingAt.get(`${article.slug}:${locale}`)
        if (!at || at < article.updatedAt) work.push({ article, locale })
      }
    }

    const batch = work.slice(0, PAIRS_PER_RUN)
    let translated = 0
    let failed = 0
    for (const { article, locale } of batch) {
      try {
        const tr = await translateBlogArticle({
          title: article.title,
          description: article.description,
          content: article.content,
          metaTitle: article.metaTitle,
          metaDescription: article.metaDescription,
          sourceLocale: "en",
          targetLocale: locale,
        })
        // Reject malformed MDX before it can reach MDXRemote on the live page.
        await assertCompiles(tr.content)
        const now = new Date()
        await db
          .insert(blogArticleTranslation)
          .values({
            slug: article.slug,
            locale,
            title: tr.title,
            description: tr.description,
            content: tr.content,
            metaTitle: tr.metaTitle,
            metaDescription: tr.metaDescription,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [blogArticleTranslation.slug, blogArticleTranslation.locale],
            set: {
              title: tr.title,
              description: tr.description,
              content: tr.content,
              metaTitle: tr.metaTitle,
              metaDescription: tr.metaDescription,
              updatedAt: now,
            },
          })
        translated++
      } catch (err) {
        failed++
        console.error(`[translate-blog] ${article.slug} → ${locale} failed:`, err)
      }
    }

    console.log(
      `[translate-blog] ${translated} translated, ${failed} failed, ${work.length - batch.length} remaining`,
    )
    return NextResponse.json(
      { ok: failed === 0, translated, failed, remaining: work.length - batch.length },
      { status: cronStatusFromResult({ errorCount: failed, successCount: translated }) },
    )
  } catch (err) {
    console.error("[translate-blog] failed:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
