/**
 * One-shot: generate long_description for a single project by slug.
 * Bypasses Crawl4AI (uses plain fetch + cheap text extraction) since the
 * local env has a placeholder CRAWL4AI_URL. Production cron uses the real
 * pipeline.
 *
 * Usage: bun run scripts/enrich-one.ts <slug>
 */

import { db } from "@/drizzle/db"
import { project, projectTranslation } from "@/drizzle/db/schema"
import { and, eq } from "drizzle-orm"

import { generateLongDescription } from "@/lib/enrich-project"

async function fetchAsMarkdown(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; aat.ee/1.0; +https://www.aat.ee/bot)",
      Accept: "text/html,application/xhtml+xml",
    },
    signal: AbortSignal.timeout(30000),
  })
  if (!res.ok) throw new Error(`fetch ${url} HTTP ${res.status}`)
  const html = await res.text()
  // Cheap HTML→text: drop script/style, then strip tags, collapse whitespace.
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/?[a-zA-Z][^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 8000)
}

async function main() {
  const slug = process.argv[2]
  if (!slug) {
    console.error("usage: bun run scripts/enrich-one.ts <slug>")
    process.exit(1)
  }

  const [proj] = await db
    .select({
      id: project.id,
      name: project.name,
      websiteUrl: project.websiteUrl,
    })
    .from(project)
    .where(eq(project.slug, slug))
    .limit(1)
  if (!proj) {
    console.error(`project not found: ${slug}`)
    process.exit(1)
  }
  if (!proj.websiteUrl) {
    console.error(`project ${slug} has no websiteUrl`)
    process.exit(1)
  }

  const [enRow] = await db
    .select({ description: projectTranslation.description })
    .from(projectTranslation)
    .where(and(eq(projectTranslation.projectId, proj.id), eq(projectTranslation.locale, "en")))
    .limit(1)
  if (!enRow) {
    console.error(`no EN translation row for ${slug} — run translate cron first`)
    process.exit(1)
  }

  console.log(`fetching ${proj.websiteUrl} ...`)
  const crawled = await fetchAsMarkdown(proj.websiteUrl)
  console.log(`fetched ${crawled.length} chars`)

  console.log(`asking DeepSeek for long_description ...`)
  const longDescription = await generateLongDescription({
    name: proj.name,
    shortDescription: enRow.description,
    crawledMarkdown: crawled,
  })
  console.log(`generated ${longDescription.length} chars`)
  console.log("---")
  console.log(longDescription)
  console.log("---")

  await db
    .update(projectTranslation)
    .set({ longDescription, longDescriptionGeneratedAt: new Date() })
    .where(and(eq(projectTranslation.projectId, proj.id), eq(projectTranslation.locale, "en")))
  console.log(`✅ wrote long_description to project_translation (${proj.id}, en)`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
