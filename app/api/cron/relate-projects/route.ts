import { NextRequest, NextResponse } from "next/server"

import { db } from "@/drizzle/db"
import {
  project,
  projectRelated,
  projectToCategory,
  projectToTag,
  tag as tagTable,
} from "@/drizzle/db/schema"
import { eq, inArray, sql } from "drizzle-orm"

import { verifyCronAuth } from "@/lib/cron-auth"
import { pickRelatedProjects, type RelatedCandidate } from "@/lib/enrich-project"

export const dynamic = "force-dynamic"
export const maxDuration = 90

const MAX_PROJECTS_PER_RUN = 3
const CANDIDATE_LIMIT = 25
const RELATED_LIMIT = 4
// Re-attempt window: a project that was attempted but yielded no relations
// won't be tried again for this many days. Lets new tags/categories trigger
// a retry without burning DeepSeek calls every 5 minutes in the meantime.
const REATTEMPT_DAYS = 30

/**
 * For each subject project that has not been attempted recently, build a
 * candidate set (projects sharing tags or categories), ask DeepSeek which are
 * most related, write the ordered result into project_related.
 *
 * Every iteration stamps `project.related_attempted_at = NOW()` so projects
 * with no overlap pool / no AI picks aren't re-evaluated every tick.
 */
export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request)
  if (authError) return authError

  const reattemptCutoff = new Date(Date.now() - REATTEMPT_DAYS * 24 * 60 * 60 * 1000)

  const subjects = await db
    .select({
      id: project.id,
      name: project.name,
      description: project.description,
    })
    .from(project)
    .where(
      sql`NOT EXISTS (SELECT 1 FROM ${projectRelated} WHERE ${projectRelated.projectId} = ${project.id})
          AND (${project.relatedAttemptedAt} IS NULL OR ${project.relatedAttemptedAt} < ${reattemptCutoff})`,
    )
    .limit(MAX_PROJECTS_PER_RUN)

  let written = 0
  let failed = 0
  let skipped = 0
  const errors: string[] = []

  // Helper: stamp the attempt regardless of outcome so projects with no pool
  // / no picks / unique-violation conflicts don't re-enter the candidate set
  // immediately.
  const markAttempted = async (projectId: string) => {
    await db
      .update(project)
      .set({ relatedAttemptedAt: new Date() })
      .where(eq(project.id, projectId))
  }

  for (const subject of subjects) {
    try {
      // Subject's tags and categories
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

      if (subjectTagIds.length === 0 && subjectCategoryIds.length === 0) {
        await markAttempted(subject.id)
        skipped++
        continue
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

      if (candidateIds.length === 0) {
        await markAttempted(subject.id)
        skipped++
        continue
      }

      const candidateProjects = await db
        .select({
          id: project.id,
          name: project.name,
          description: project.description,
        })
        .from(project)
        .where(inArray(project.id, candidateIds))
        .limit(CANDIDATE_LIMIT)

      const candidateTagsRows = await db
        .select({
          projectId: projectToTag.projectId,
          name: tagTable.name,
        })
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

      const picked = await pickRelatedProjects(
        {
          name: subject.name,
          description: subject.description,
          tags: subjectTagNames,
        },
        candidates,
        RELATED_LIMIT,
      )

      if (picked.length === 0) {
        await markAttempted(subject.id)
        skipped++
        continue
      }

      // Atomic replace inside a transaction: delete + insert under the same
      // snapshot. Combined with the unique (project_id, rank) constraint, a
      // concurrent runner will hit a unique violation and have its tx rolled
      // back rather than producing duplicate ranks.
      try {
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
          await tx
            .update(project)
            .set({ relatedAttemptedAt: now })
            .where(eq(project.id, subject.id))
        })
        written += picked.length
      } catch (txErr) {
        // If this is a unique-violation from a concurrent runner, the winning
        // runner already stamped — restamping is harmless. If it's a real DB
        // error (deadlock, FK violation from corrupted candidate IDs), not
        // stamping would let the same subject retry every 5 minutes forever.
        // Stamp either way; pathological subjects fall out of the queue and
        // healthy subjects keep flowing.
        failed++
        errors.push(`${subject.id} tx: ${txErr instanceof Error ? txErr.message : txErr}`)
        await markAttempted(subject.id).catch(() => {})
      }
    } catch (err) {
      // Same tradeoff as the catch in generate-alternatives: a transient
      // failure costs a 30-day false-positive; permanent failure without a
      // stamp would starve the queue. Stamp.
      failed++
      errors.push(`${subject.id}: ${err instanceof Error ? err.message : err}`)
      await markAttempted(subject.id).catch(() => {})
    }
  }

  // 5xx if every attempted subject errored (partial errors stay 200).
  const status = errors.length > 0 && written === 0 ? 500 : 200
  return NextResponse.json(
    {
      subjects: subjects.length,
      written,
      skipped,
      failed,
      reattemptDays: REATTEMPT_DAYS,
      errors: errors.slice(0, 10),
    },
    { status },
  )
}
