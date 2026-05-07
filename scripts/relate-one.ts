/**
 * One-shot: pick related projects for a single subject by slug.
 * Mirrors app/api/cron/relate-projects/route.ts logic but targets one project.
 *
 * Usage: bun run scripts/relate-one.ts <slug>
 */

import { db } from "@/drizzle/db"
import {
  project,
  projectRelated,
  projectToCategory,
  projectToTag,
  tag as tagTable,
} from "@/drizzle/db/schema"
import { eq, inArray } from "drizzle-orm"

import { pickRelatedProjects, type RelatedCandidate } from "@/lib/enrich-project"

const CANDIDATE_LIMIT = 25
const RELATED_LIMIT = 4

async function main() {
  const slug = process.argv[2]
  if (!slug) {
    console.error("usage: bun run scripts/relate-one.ts <slug>")
    process.exit(1)
  }

  const [subject] = await db
    .select({ id: project.id, name: project.name, description: project.description })
    .from(project)
    .where(eq(project.slug, slug))
    .limit(1)
  if (!subject) {
    console.error(`project not found: ${slug}`)
    process.exit(1)
  }

  const subjectTags = await db
    .select({ id: projectToTag.tagId, name: tagTable.name })
    .from(projectToTag)
    .innerJoin(tagTable, eq(tagTable.id, projectToTag.tagId))
    .where(eq(projectToTag.projectId, subject.id))
  const subjectTagIds = subjectTags.map((r) => r.id)
  const subjectTagNames = subjectTags.map((r) => r.name)

  const subjectCategoryRows = await db
    .select({ categoryId: projectToCategory.categoryId })
    .from(projectToCategory)
    .where(eq(projectToCategory.projectId, subject.id))
  const subjectCategoryIds = subjectCategoryRows.map((r) => r.categoryId)

  console.log(`subject tags=${subjectTagIds.length} categories=${subjectCategoryIds.length}`)
  if (subjectTagIds.length === 0 && subjectCategoryIds.length === 0) {
    console.error("no tags / categories — cannot relate")
    process.exit(1)
  }

  const tagOverlapRows = subjectTagIds.length
    ? await db
        .selectDistinct({ projectId: projectToTag.projectId })
        .from(projectToTag)
        .where(inArray(projectToTag.tagId, subjectTagIds))
    : []
  const categoryOverlapRows = subjectCategoryIds.length
    ? await db
        .selectDistinct({ projectId: projectToCategory.projectId })
        .from(projectToCategory)
        .where(inArray(projectToCategory.categoryId, subjectCategoryIds))
    : []

  const candidateIdSet = new Set<string>()
  for (const r of tagOverlapRows) candidateIdSet.add(r.projectId)
  for (const r of categoryOverlapRows) candidateIdSet.add(r.projectId)
  candidateIdSet.delete(subject.id)
  const candidateIds = Array.from(candidateIdSet).slice(0, CANDIDATE_LIMIT * 2)
  console.log(`candidate pool: ${candidateIds.length}`)

  if (candidateIds.length === 0) {
    console.error("empty candidate pool")
    process.exit(1)
  }

  const candidateProjects = await db
    .select({ id: project.id, name: project.name, description: project.description })
    .from(project)
    .where(inArray(project.id, candidateIds))
    .limit(CANDIDATE_LIMIT)

  const candidateTagsRows = await db
    .select({ projectId: projectToTag.projectId, name: tagTable.name })
    .from(projectToTag)
    .innerJoin(tagTable, eq(tagTable.id, projectToTag.tagId))
    .where(
      inArray(
        projectToTag.projectId,
        candidateProjects.map((p) => p.id),
      ),
    )
  const tagsByProject = new Map<string, string[]>()
  for (const row of candidateTagsRows) {
    const list = tagsByProject.get(row.projectId) ?? []
    list.push(row.name)
    tagsByProject.set(row.projectId, list)
  }

  const candidates: RelatedCandidate[] = candidateProjects.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    tags: tagsByProject.get(p.id) ?? [],
  }))

  console.log(`asking DeepSeek to pick top ${RELATED_LIMIT} related ...`)
  const picked = await pickRelatedProjects(
    { name: subject.name, description: subject.description, tags: subjectTagNames },
    candidates,
    RELATED_LIMIT,
  )
  console.log(`picked ${picked.length}: ${picked.join(", ")}`)
  if (picked.length === 0) {
    console.error("no AI picks")
    process.exit(1)
  }

  await db.transaction(async (tx) => {
    await tx.delete(projectRelated).where(eq(projectRelated.projectId, subject.id))
    const now = new Date()
    const rows = picked.map((relatedId, idx) => ({
      projectId: subject.id,
      relatedProjectId: relatedId,
      rank: idx + 1,
      generatedAt: now,
    }))
    await tx.insert(projectRelated).values(rows)
    await tx.update(project).set({ relatedAttemptedAt: now }).where(eq(project.id, subject.id))
  })

  console.log(`✅ wrote ${picked.length} related rows`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
