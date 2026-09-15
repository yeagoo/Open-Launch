import "server-only"

import { project, communityThread as thread, user } from "@/drizzle/db/schema"
import { and, eq, inArray, sql } from "drizzle-orm"

import { CommunityError, type CommunityViewer, type MemberRole } from "./contracts"
import type { CommunityActor, CommunityTransaction } from "./server-types"

export const publicThread = and(eq(thread.lifecycle, "published"), eq(thread.moderation, "public"))!
export async function readActor(
  tx: CommunityTransaction,
  id: string | null,
  lock = false,
): Promise<CommunityActor | null> {
  if (!id) return null
  const query = tx
    .select({
      id: user.id,
      role: user.role,
      verified: user.emailVerified,
      banned: user.banned,
      expires: user.banExpires,
      bot: user.isBot,
    })
    .from(user)
    .where(eq(user.id, id))
    .limit(1)
  const [row] = await (lock ? query.for("share") : query)
  if (!row) return null
  return {
    id: row.id,
    admin: row.role === "admin",
    verified: row.verified,
    blocked: !!row.banned && (!row.expires || row.expires.getTime() > Date.now()),
    bot: !!row.bot,
  }
}
export function requireParticipant(actor: CommunityActor | null): asserts actor is CommunityActor {
  if (!actor) throw new CommunityError("unauthorized", "Sign in to participate")
  if (actor.blocked || actor.bot)
    throw new CommunityError("forbidden", "This account cannot participate")
  if (!actor.verified)
    throw new CommunityError("forbidden", "Verify your email before participating")
}
export function requireModerator(actor: CommunityActor | null): asserts actor is CommunityActor {
  requireParticipant(actor)
  if (!actor.admin) throw new CommunityError("forbidden", "Moderator access required")
}
/** UI hints only; every write repeats the authoritative checks above. */
export function viewerFor(actor: CommunityActor | null): CommunityViewer {
  if (!actor) return { id: null, role: "anonymous", canParticipate: false }
  if (actor.blocked || actor.bot) return { id: actor.id, role: "banned", canParticipate: false }
  if (!actor.verified) return { id: actor.id, role: "unverified", canParticipate: false }
  const role: MemberRole = actor.admin ? "moderator" : "member"
  return { id: actor.id, role, canParticipate: true }
}
export async function lockThread(tx: CommunityTransaction, id: string) {
  const [row] = await tx.select().from(thread).where(eq(thread.id, id)).for("update")
  if (!row) throw new CommunityError("missing", "Post not found")
  return row
}
export function assertOpen(row: typeof thread.$inferSelect) {
  if (row.lifecycle !== "published" || row.moderation !== "public")
    throw new CommunityError("missing", "Post unavailable")
  if (row.lockedAt) throw new CommunityError("forbidden", "This post is locked")
}
export function canReadBody(
  row: Pick<typeof thread.$inferSelect, "lifecycle" | "moderation" | "authorId">,
  actor: CommunityActor | null,
) {
  if (row.lifecycle === "draft") return !!actor && actor.id === row.authorId
  if (row.lifecycle === "deleted") return false
  return (
    row.moderation === "public" ||
    (!!actor &&
      ((actor.admin && actor.verified && !actor.blocked && !actor.bot) ||
        (row.authorId === actor.id && row.moderation === "pending")))
  )
}
export async function validateProduct(tx: CommunityTransaction, id: string) {
  if (!id) return null
  const [row] = await tx
    .select({ id: project.id })
    .from(project)
    .where(and(eq(project.id, id), inArray(project.launchStatus, ["ongoing", "launched"])))
    .for("share")
  if (!row) throw new CommunityError("validation", "Choose a publicly visible product")
  return row.id
}
export async function draftLock(tx: CommunityTransaction, actorId: string) {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext('community:draft'),hashtext(${actorId}))`,
  )
}
