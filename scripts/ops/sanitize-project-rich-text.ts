#!/usr/bin/env bun
import * as dotenv from "dotenv"
import { and, eq } from "drizzle-orm"

import { sanitizeRichText } from "@/lib/sanitize"

type Args = {
  envFile: string
  dryRun: boolean
}

function parseArgs(argv: string[]): Args {
  const value = (name: string) =>
    argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3)

  return {
    envFile: value("env") ?? ".env.local",
    dryRun: argv.includes("--dry-run"),
  }
}

async function sanitizeProjects(dryRun: boolean): Promise<number> {
  const [{ db }, { project }] = await Promise.all([
    import("@/drizzle/db"),
    import("@/drizzle/db/schema"),
  ])
  const rows = await db.select({ id: project.id, description: project.description }).from(project)

  let changed = 0
  for (const row of rows) {
    const sanitized = sanitizeRichText(row.description)
    if (sanitized === row.description) continue

    changed++
    if (!dryRun) {
      await db
        .update(project)
        .set({ description: sanitized, updatedAt: new Date() })
        .where(eq(project.id, row.id))
    }
  }

  return changed
}

async function sanitizeProjectTranslations(dryRun: boolean): Promise<number> {
  const [{ db }, { projectTranslation }] = await Promise.all([
    import("@/drizzle/db"),
    import("@/drizzle/db/schema"),
  ])
  const rows = await db
    .select({
      projectId: projectTranslation.projectId,
      locale: projectTranslation.locale,
      description: projectTranslation.description,
    })
    .from(projectTranslation)

  let changed = 0
  for (const row of rows) {
    const sanitized = sanitizeRichText(row.description)
    if (sanitized === row.description) continue

    changed++
    if (!dryRun) {
      await db
        .update(projectTranslation)
        .set({ description: sanitized, updatedAt: new Date() })
        .where(
          and(
            eq(projectTranslation.projectId, row.projectId),
            eq(projectTranslation.locale, row.locale),
          ),
        )
    }
  }

  return changed
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  dotenv.config({ path: args.envFile, override: true })

  const [projectChanges, translationChanges] = await Promise.all([
    sanitizeProjects(args.dryRun),
    sanitizeProjectTranslations(args.dryRun),
  ])

  console.log(
    JSON.stringify({
      ok: true,
      dryRun: args.dryRun,
      projectChanges,
      translationChanges,
    }),
  )
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(2)
})
