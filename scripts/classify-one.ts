/**
 * Quick: run the quality classifier against a list of project slugs and
 * write the verdict back to the DB. Useful for spot-checking the prompt.
 *
 * Usage: bun run scripts/classify-one.ts slug1 slug2 …
 */

import { db } from "@/drizzle/db"
import { project } from "@/drizzle/db/schema"
import { eq, inArray } from "drizzle-orm"

import { classifyProjectQuality } from "@/lib/ai-quality"

async function main() {
  const slugs = process.argv.slice(2)
  if (slugs.length === 0) {
    console.error("usage: bun run scripts/classify-one.ts <slug> [<slug>…]")
    process.exit(1)
  }

  const projects = await db
    .select({
      id: project.id,
      slug: project.slug,
      name: project.name,
      description: project.description,
      websiteUrl: project.websiteUrl,
    })
    .from(project)
    .where(inArray(project.slug, slugs))

  for (const p of projects) {
    const verdict = await classifyProjectQuality({
      name: p.name,
      description: p.description,
      websiteUrl: p.websiteUrl,
    })
    await db
      .update(project)
      .set({
        isLowQuality: verdict.isLowQuality,
        qualityScore: verdict.score,
        qualityReason: verdict.reason,
        qualityCheckedAt: new Date(),
      })
      .where(eq(project.id, p.id))
    console.log(
      `${p.slug.padEnd(30)} score=${verdict.score} flagged=${verdict.isLowQuality} reason=${verdict.reason}`,
    )
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
