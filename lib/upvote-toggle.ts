import { upvote } from "@/drizzle/db/schema"
import { and, eq, sql } from "drizzle-orm"
import type { NodePgDatabase } from "drizzle-orm/node-postgres"

type UpvoteDatabase = NodePgDatabase<typeof import("@/drizzle/db/schema")>

/**
 * Toggle one user's vote as a linearizable PostgreSQL transaction.
 *
 * The advisory lock serializes requests for the same user/project pair. The
 * unique index remains the integrity backstop, and `returning()` ensures the
 * caller never reports an added vote when an insert was skipped.
 */
export async function toggleUpvoteAtomically(
  database: UpvoteDatabase,
  userId: string,
  projectId: string,
): Promise<boolean> {
  return database.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId}), hashtext(${projectId}))`)

    const [existingUpvote] = await tx
      .select({ id: upvote.id })
      .from(upvote)
      .where(and(eq(upvote.userId, userId), eq(upvote.projectId, projectId)))
      .limit(1)

    if (existingUpvote) {
      await tx.delete(upvote).where(and(eq(upvote.userId, userId), eq(upvote.projectId, projectId)))
      return false
    }

    const inserted = await tx
      .insert(upvote)
      .values({
        id: crypto.randomUUID(),
        userId,
        projectId,
        createdAt: new Date(),
      })
      .onConflictDoNothing()
      .returning({ id: upvote.id })

    return inserted.length === 1
  })
}
