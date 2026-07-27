/**
 * Durable email outbox.
 *
 * Notification senders (winner badges, launch reminders) ENQUEUE one row
 * per (event, recipient) with a stable event_key and then drain. This
 * replaces the old inline-send crons, which had two failure modes:
 *   - partial failure: the route still returned 200 and the failed
 *     recipients were silently lost until the next day (or forever), and
 *   - whole-run retry: recipients already mailed got a duplicate.
 *
 * Idempotency layers:
 *   1. event_key UNIQUE — re-enqueueing the same event is a no-op, so
 *      senders can scan a multi-day compensation window safely.
 *   2. event_key as Resend Idempotency-Key — a crash between
 *      provider-accept and mark-sent can't double-deliver.
 *   3. status transitions — only pending/failed rows are (re)sent.
 *
 * The `/api/cron/drain-email-outbox` cron retries every 10 minutes, so a
 * Resend outage costs at most that delay instead of a full day.
 */

import { db } from "@/drizzle/db"
import { emailOutbox } from "@/drizzle/db/schema"
import { and, asc, eq, gte, inArray, lt, or, sql } from "drizzle-orm"

import { sendLaunchReminderEmail, sendWinnerBadgeEmail } from "@/lib/transactional-emails"

export type EmailOutboxKind = "winner_badge" | "launch_reminder"

export interface WinnerBadgePayload {
  email: string
  name: string | null
  projectName: string
  projectSlug: string
  ranking: number
  launchType: string | null
}

export interface LaunchReminderPayload {
  email: string
  name: string | null
  projectName: string
  projectSlug: string
}

// 12 attempts at the 10-minute drain cadence ≈ 2h of retries, long enough
// to ride out a Resend incident. Rows that exhaust attempts stay `failed`
// and surface via the drain route's failure count (and cron_run_log).
const MAX_ATTEMPTS = 12
const DRAIN_BATCH = 50

/** Idempotent: a duplicate event_key is silently absorbed. */
export async function enqueueEmail(
  kind: EmailOutboxKind,
  eventKey: string,
  payload: WinnerBadgePayload | LaunchReminderPayload,
): Promise<void> {
  await db
    .insert(emailOutbox)
    .values({ kind, eventKey, payload })
    .onConflictDoNothing({ target: emailOutbox.eventKey })
}

async function sendForKind(
  kind: EmailOutboxKind,
  payload: WinnerBadgePayload | LaunchReminderPayload,
  idempotencyKey: string,
): Promise<void> {
  if (kind === "winner_badge") {
    const p = payload as WinnerBadgePayload
    await sendWinnerBadgeEmail({
      user: { email: p.email, name: p.name ?? "" },
      projectName: p.projectName,
      projectSlug: p.projectSlug,
      ranking: p.ranking,
      launchType: p.launchType,
      idempotencyKey,
    })
    return
  }
  const p = payload as LaunchReminderPayload
  await sendLaunchReminderEmail({
    user: { email: p.email, name: p.name ?? "" },
    projectName: p.projectName,
    projectSlug: p.projectSlug,
    idempotencyKey,
  })
}

export interface DrainResult {
  sent: number
  failed: number
  remaining: number
  // Rows that exhausted MAX_ATTEMPTS and will never be retried. Surfaced
  // separately so they can't hide behind sent=0/failed=0/remaining=0.
  deadLettered: number
}

/**
 * Sends up to `batch` due outbox rows. Rows that fail keep their payload
 * and become eligible again on the next drain until MAX_ATTEMPTS.
 */
export async function drainEmailOutbox(batch: number = DRAIN_BATCH): Promise<DrainResult> {
  const now = new Date()
  const due = await db
    .select()
    .from(emailOutbox)
    .where(
      or(
        eq(emailOutbox.status, "pending"),
        and(eq(emailOutbox.status, "failed"), lt(emailOutbox.attempts, MAX_ATTEMPTS)),
      ),
    )
    .orderBy(asc(emailOutbox.createdAt))
    .limit(batch)

  let sent = 0
  let failed = 0
  for (const row of due) {
    try {
      await sendForKind(
        row.kind as EmailOutboxKind,
        row.payload as WinnerBadgePayload | LaunchReminderPayload,
        row.eventKey,
      )
      // Guard the transition: overlapping drains (inline sender drain vs
      // the 10-minute cron, or two instances) may work the same row
      // concurrently — never flip a row another worker already sent.
      // (A duplicate SEND itself is absorbed by the Resend Idempotency-Key.)
      const res = await db
        .update(emailOutbox)
        .set({ status: "sent", sentAt: now, updatedAt: now, lastError: null })
        .where(and(eq(emailOutbox.id, row.id), inArray(emailOutbox.status, ["pending", "failed"])))
      // Only count when WE won the transition — a concurrent drainer may
      // have flipped the row first; counting it anyway would misreport.
      if (res.rowCount && res.rowCount > 0) sent++
    } catch (err) {
      // Same guard in reverse + atomic attempts increment (a concurrent
      // failure must not overwrite the other drainer's +1 with the same
      // snapshot value, silently stretching the retry budget).
      const res = await db
        .update(emailOutbox)
        .set({
          status: "failed",
          attempts: sql`${emailOutbox.attempts} + 1`,
          lastError: err instanceof Error ? err.message : String(err),
          updatedAt: now,
        })
        .where(and(eq(emailOutbox.id, row.id), inArray(emailOutbox.status, ["pending", "failed"])))
      if (res.rowCount && res.rowCount > 0) failed++
    }
  }

  const remaining = await db
    .select({ id: emailOutbox.id })
    .from(emailOutbox)
    .where(inArray(emailOutbox.status, ["pending"]))
    .limit(1)

  // Dead letters alert only while FRESH (last attempt within 24h). A
  // permanently-exhausted row must not keep every drain red forever —
  // that would mask real new failures behind alert fatigue.
  const deadLettered = await db
    .select({ id: emailOutbox.id })
    .from(emailOutbox)
    .where(
      and(
        eq(emailOutbox.status, "failed"),
        gte(emailOutbox.attempts, MAX_ATTEMPTS),
        gte(emailOutbox.updatedAt, new Date(Date.now() - 24 * 3600_000)),
      ),
    )
    .limit(1)

  return { sent, failed, remaining: remaining.length, deadLettered: deadLettered.length }
}
