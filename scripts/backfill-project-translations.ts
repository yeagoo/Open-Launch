/**
 * One-off backfill: copy every existing project.description into
 * project_translation as a source-locale row (using project.source_locale,
 * which defaults to "en" for legacy data).
 *
 * The cron at /api/cron/translate-projects then picks them up and fills in
 * the remaining locales.
 *
 * Usage:
 *   bun run scripts/backfill-project-translations.ts
 *   bun run scripts/backfill-project-translations.ts --dry
 */
import { eq } from "drizzle-orm"

import { db } from "../drizzle/db"
import { project, projectTranslation } from "../drizzle/db/schema"

async function main() {
  const dry = process.argv.includes("--dry")

  const projects = await db
    .select({
      id: project.id,
      description: project.description,
      sourceLocale: project.sourceLocale,
    })
    .from(project)

  console.log(`Found ${projects.length} projects.`)

  let inserted = 0
  let skipped = 0

  for (const p of projects) {
    const existing = await db
      .select({ locale: projectTranslation.locale })
      .from(projectTranslation)
      .where(eq(projectTranslation.projectId, p.id))

    const hasSource = existing.some((r) => r.locale === (p.sourceLocale || "en"))
    if (hasSource) {
      skipped++
      continue
    }

    if (dry) {
      console.log(`  [dry] would insert source row for ${p.id} (${p.sourceLocale})`)
      inserted++
      continue
    }

    await db.insert(projectTranslation).values({
      projectId: p.id,
      locale: p.sourceLocale || "en",
      description: p.description,
      isSource: true,
      aiGenerated: false,
    })
    inserted++
    console.log(`  + ${p.id} (${p.sourceLocale})`)
  }

  console.log("")
  console.log(`Inserted: ${inserted}`)
  console.log(`Skipped (already had source row): ${skipped}`)
  console.log("")
  console.log("Next: trigger the cron a few times to fill the other 7 locales:")
  console.log(
    "  curl -H 'Authorization: Bearer $CRON_API_KEY' http://localhost:3004/api/cron/translate-projects",
  )
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
