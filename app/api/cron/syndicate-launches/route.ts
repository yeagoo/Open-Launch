import { NextRequest, NextResponse } from "next/server"

import { db } from "@/drizzle/db"
import { directoryOrder, launchSyndication } from "@/drizzle/db/schema"
import { and, eq, inArray, isNull, lt, lte, or, sql } from "drizzle-orm"

import { verifyCronAuth } from "@/lib/cron-auth"
import {
  buildLaunchPayload,
  enqueueLaunchSyndication,
  postLaunchToSite,
  SYNDICATED_TIERS,
  SYNDICATION_SITES,
  type LaunchPayload,
  type PostResult,
  type SyndicationSite,
} from "@/lib/launch-syndication"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// Give up auto-retrying after this many failures; the row stays `failed`
// for an admin to inspect / manually retry. 8 attempts with exponential
// backoff spans ~4h, enough to ride out a partner-site deploy/outage.
const MAX_ATTEMPTS = 8
// How many rows to drain per tick. The dispatcher fires this every 2 min.
const BATCH = 25
// Reconcile window: re-enqueue verified, still-live syndicated orders created
// in the last N hours that have NO queue rows (a transient webhook enqueue
// failure, or an admin marking an order paid by hand). Bounded so we never
// reprocess the back-catalogue.
const RECONCILE_WINDOW_HOURS = 6
// Promotion sweep window: how far back to look for `paid` orders that are
// fully `sent` but weren't promoted (e.g. the worker crashed after the last
// send, before flipping the order to fulfilled).
const PROMOTE_WINDOW_HOURS = 24

const SYNDICATED_TIER_LIST = [...SYNDICATED_TIERS]

/**
 * Drains the launch_syndication queue and keeps directory_order fulfilment in
 * sync. Every step is gated on the order being a VERIFIED, still-live
 * (paid/fulfilled) syndicated order, so:
 *   - an amount-mismatch order held for review (amount_verified=false) is never
 *     enqueued, posted, or promoted, and
 *   - a canceled/refunded order's rows are never posted.
 *
 * Steps: (0) reconcile missing rows, (1) post due rows with retry/backoff,
 * (2) promote orders whose every partner site is `sent`. Enqueue stays the
 * webhook's fast path; reconcile is the decoupled safety net so a syndication
 * hiccup can never block the Stripe payment webhook.
 */
export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request)
  if (authError) return authError

  const now = new Date()

  // 0. Reconcile: backfill missing rows for verified, still-live orders only.
  // Gating on amount_verified=true is what makes this safe — a blanket
  // reconcile would re-enqueue held mismatch orders and bypass the hold.
  let reconciled = 0
  const reconcileCutoff = new Date(now.getTime() - RECONCILE_WINDOW_HOURS * 3_600_000)
  const missing = await db
    .select({
      id: directoryOrder.id,
      projectId: directoryOrder.projectId,
      tier: directoryOrder.tier,
    })
    .from(directoryOrder)
    .where(
      and(
        inArray(directoryOrder.tier, SYNDICATED_TIER_LIST),
        inArray(directoryOrder.status, ["paid", "fulfilled"]),
        eq(directoryOrder.amountVerified, true),
        // Recency by when it became actionable (paidAt), not createdAt — an
        // async payment (SEPA/bank transfer) settles long after the order row
        // was created. updatedAt is the fallback for admin-paid rows.
        sql`coalesce(${directoryOrder.paidAt}, ${directoryOrder.updatedAt}) > ${reconcileCutoff}`,
        sql`not exists (select 1 from ${launchSyndication} ls where ls.order_id = ${directoryOrder.id})`,
      ),
    )
    .limit(BATCH)
  for (const o of missing) {
    try {
      await enqueueLaunchSyndication(o.id, o.projectId, o.tier)
      reconciled++
    } catch (err) {
      console.error("[syndicate] reconcile enqueue failed:", o.id, err)
    }
  }

  // 1. Due rows — joined to a still-live, verified order so canceled/refunded/
  // held orders are never posted.
  const due = await db
    .select({
      id: launchSyndication.id,
      orderId: launchSyndication.orderId,
      projectId: launchSyndication.projectId,
      site: launchSyndication.site,
      tier: launchSyndication.tier,
      attempts: launchSyndication.attempts,
    })
    .from(launchSyndication)
    .innerJoin(directoryOrder, eq(directoryOrder.id, launchSyndication.orderId))
    .where(
      and(
        inArray(directoryOrder.status, ["paid", "fulfilled"]),
        eq(directoryOrder.amountVerified, true),
        or(
          eq(launchSyndication.status, "pending"),
          and(
            eq(launchSyndication.status, "failed"),
            lt(launchSyndication.attempts, MAX_ATTEMPTS),
            or(isNull(launchSyndication.nextAttemptAt), lte(launchSyndication.nextAttemptAt, now)),
          ),
        ),
      ),
    )
    .limit(BATCH)

  let sent = 0
  let failed = 0
  let deferred = 0

  if (due.length > 0) {
    // Build each project's payload once, sequentially — no cache race.
    const payloads = new Map<string, LaunchPayload | null>()
    for (const row of due) {
      if (!payloads.has(row.projectId)) {
        payloads.set(row.projectId, await buildLaunchPayload(row.projectId, row.tier))
      }
    }

    // Group rows by (site, projectId) so two orders for the same project can't
    // race to insert the same listing on the same site within one tick. Post
    // once per group and apply the outcome to every row in it (the receiver
    // dedupes by URL anyway, so the result is identical).
    const groups = new Map<string, typeof due>()
    for (const row of due) {
      const key = `${row.site}::${row.projectId}`
      const g = groups.get(key)
      if (g) g.push(row)
      else groups.set(key, [row])
    }

    await Promise.all(
      [...groups.values()].map(async (rows) => {
        const head = rows[0]
        const payload = payloads.get(head.projectId) ?? null
        const result: PostResult = payload
          ? await postLaunchToSite(head.site as SyndicationSite, head.orderId, payload)
          : { ok: false, error: "project not found" }

        for (const row of rows) {
          if (result.ok) {
            sent++
            await db
              .update(launchSyndication)
              .set({
                status: "sent",
                attempts: row.attempts + 1,
                externalId: result.externalId ?? null,
                externalUrl: result.externalUrl ?? null,
                lastError: null,
                sentAt: now,
                nextAttemptAt: null,
                updatedAt: now,
              })
              .where(eq(launchSyndication.id, row.id))
          } else if (result.configError) {
            // Local misconfig — record but DON'T burn an attempt; the row stays
            // pending and recovers automatically once the env var is set.
            deferred++
            await db
              .update(launchSyndication)
              .set({ lastError: result.error ?? "not configured", updatedAt: now })
              .where(eq(launchSyndication.id, row.id))
          } else {
            failed++
            const attempts = row.attempts + 1
            const backoffMin = Math.min(2 ** attempts, 120)
            await db
              .update(launchSyndication)
              .set({
                status: "failed",
                attempts,
                lastError: result.error ?? "unknown error",
                nextAttemptAt: new Date(now.getTime() + backoffMin * 60_000),
                updatedAt: now,
              })
              .where(eq(launchSyndication.id, row.id))
          }
        }
      }),
    )
  }

  // 2. Promotion sweep — independent of the drain above, so an order whose rows
  // all turned `sent` in a previous tick (worker crashed before promoting) is
  // still picked up. Promote `paid` → `fulfilled` only when EVERY configured
  // site is `sent`; held/partial orders never qualify.
  let ordersFulfilled = 0
  const promoteCutoff = new Date(now.getTime() - PROMOTE_WINDOW_HOURS * 3_600_000)
  const promotable = await db
    .select({ id: directoryOrder.id })
    .from(directoryOrder)
    .where(
      and(
        inArray(directoryOrder.tier, SYNDICATED_TIER_LIST),
        eq(directoryOrder.status, "paid"),
        eq(directoryOrder.amountVerified, true),
        // By paidAt (when it became actionable), not createdAt — see reconcile.
        sql`coalesce(${directoryOrder.paidAt}, ${directoryOrder.updatedAt}) > ${promoteCutoff}`,
      ),
    )
    .limit(100)
  for (const order of promotable) {
    const rows = await db
      .select({ site: launchSyndication.site, status: launchSyndication.status })
      .from(launchSyndication)
      .where(eq(launchSyndication.orderId, order.id))
    const sentSites = new Set(rows.filter((r) => r.status === "sent").map((r) => r.site))
    if (!SYNDICATION_SITES.every((s) => sentSites.has(s))) continue
    const res = await db
      .update(directoryOrder)
      .set({
        status: "fulfilled",
        fulfilledAt: now,
        adminNotes: sql`trim(coalesce(${directoryOrder.adminNotes}, '') || E'\nAuto-fulfilled by launch syndication')`,
        updatedAt: now,
      })
      .where(and(eq(directoryOrder.id, order.id), eq(directoryOrder.status, "paid")))
    if (res.rowCount && res.rowCount > 0) ordersFulfilled++
  }

  return NextResponse.json({
    ranAt: now.toISOString(),
    reconciled,
    drained: due.length,
    sent,
    failed,
    deferred,
    ordersFulfilled,
  })
}
