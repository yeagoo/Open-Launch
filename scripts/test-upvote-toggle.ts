import { project, upvote, user } from "@/drizzle/db/schema"
import * as schema from "@/drizzle/db/schema"
import { and, count, eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"

import { toggleUpvoteAtomically } from "@/lib/upvote-toggle"

const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error("DATABASE_URL is required")

const target = new URL(connectionString)
const databaseName = target.pathname.replace(/^\//, "")
if (
  !["127.0.0.1", "localhost", "::1", "[::1]"].includes(target.hostname) ||
  !databaseName.startsWith("open_launch_release_test")
) {
  throw new Error(
    "Refusing upvote test: target must be loopback and named open_launch_release_test*",
  )
}

const fixturePrefix = `upvote-${process.pid}-${crypto.randomUUID()}`
const userId = `${fixturePrefix}-user`
const projectId = `${fixturePrefix}-project`
const pool = new Pool({ connectionString })
const db = drizzle({ client: pool, schema })

try {
  await db.insert(user).values({
    id: userId,
    name: "Upvote Transaction User",
    email: `${fixturePrefix}@example.test`,
    emailVerified: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  })
  await db.insert(project).values({
    id: projectId,
    name: "Upvote Transaction Project",
    slug: projectId,
    description: "PostgreSQL upvote transaction fixture",
    websiteUrl: `https://${fixturePrefix}.example.test`,
    logoUrl: "https://static.example.test/logo.png",
    createdBy: userId,
  })

  const added = await toggleUpvoteAtomically(db, userId, projectId)
  assert(added, "first toggle did not report an added vote")
  assert((await voteCount()) === 1, "first toggle did not persist exactly one vote")

  const removed = await toggleUpvoteAtomically(db, userId, projectId)
  assert(!removed, "second toggle did not report a removed vote")
  assert((await voteCount()) === 0, "second toggle did not remove the vote")

  const concurrentResults = await Promise.all([
    toggleUpvoteAtomically(db, userId, projectId),
    toggleUpvoteAtomically(db, userId, projectId),
  ])
  assert(
    concurrentResults.filter(Boolean).length === 1,
    `concurrent toggles were not serialized: ${JSON.stringify(concurrentResults)}`,
  )
  assert((await voteCount()) === 0, "two concurrent toggles did not restore the initial state")

  console.log(JSON.stringify({ status: "passed", concurrentResults }))
} finally {
  await db.delete(upvote).where(and(eq(upvote.userId, userId), eq(upvote.projectId, projectId)))
  await db.delete(project).where(eq(project.id, projectId))
  await db.delete(user).where(eq(user.id, userId))
  await pool.end()
}

async function voteCount(): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(upvote)
    .where(and(eq(upvote.userId, userId), eq(upvote.projectId, projectId)))
  return row?.value ?? 0
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message)
}
