import { NextRequest, NextResponse } from "next/server"

import { db } from "@/drizzle/db"
import { directoryOrder, project, webhookHealthCheck } from "@/drizzle/db/schema"
import { eq } from "drizzle-orm"
import Stripe from "stripe"

import { verifyCronAuth } from "@/lib/cron-auth"
import { DIRECTORY_ORDER_REF_PREFIX } from "@/lib/directory-tiers"
import { sendAdminPaymentNotification } from "@/lib/transactional-emails"

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-04-22.dahlia",
})

/**
 * Stripe webhook health monitor.
 *
 * Background: on 2026-05-11 our webhook URL silently started 302'ing
 * (Cloudflare redirected `aat.ee` → `www.aat.ee` and Stripe webhooks
 * don't follow redirects). 22 deliveries failed before the symptom
 * surfaced 6 days later via a customer report. Several real payments
 * were orphaned in that window.
 *
 * This cron catches that class of silent failure proactively:
 *   1. Ask Stripe for the last 24h of `checkout.session.completed`
 *      events that targeted our directory-order flow (ref starts
 *      with `dir_`).
 *   2. Check whether each event's session id landed in our
 *      `directory_order.stripeSessionId` column.
 *   3. Any unmatched events → webhook didn't reach us / didn't write
 *      → alert admin with the count + the first few session ids.
 *
 * False positives:
 *   - A failed handler run that crashed AFTER signature verify but
 *     BEFORE the DB write. Same alert, same correct response: look at
 *     Stripe Dashboard + logs.
 *   - A delivery that arrived just before the cron snapshot — the DB
 *     write might not have committed yet. Mitigated with a 2-minute
 *     `processing_grace` window: we ignore events younger than that.
 *
 * Auth: standard CRON_API_KEY bearer (same as every other cron).
 * Dispatcher: register in `cron_schedule` with the every-6h expression
 * (see the accompanying 0023 migration for the exact cron string —
 * inlining the literal here would close this JSDoc block early
 * because the slash-asterisk inside it looks like a comment terminator).
 */
export const maxDuration = 60

const PROCESSING_GRACE_MS = 2 * 60 * 1000 // 2 min — webhook → DB write tolerance
const LOOKBACK_HOURS = 24
const MAX_EVENTS_TO_CHECK = 100 // Stripe events.list max per page

export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request)
  if (authError) return authError

  try {
    const nowSec = Math.floor(Date.now() / 1000)
    const since = nowSec - LOOKBACK_HOURS * 3600

    // Pull recent checkout.session.completed events from Stripe.
    const events = await stripe.events.list({
      type: "checkout.session.completed",
      created: { gte: since },
      limit: MAX_EVENTS_TO_CHECK,
    })

    const cutoffMs = Date.now() - PROCESSING_GRACE_MS
    type UnmatchedReason = "orphan_no_ref" | "orphan_not_in_db" | "ref_but_session_id_missing"
    const unmatched: Array<{
      sessionId: string
      reason: UnmatchedReason
      createdAt: string
      ref: string | null
    }> = []

    let totalDirectoryEvents = 0
    let matched = 0
    let skippedTooRecent = 0

    for (const event of events.data) {
      const session = event.data.object as Stripe.Checkout.Session

      // Skip events still inside the processing grace window — webhook
      // might be mid-flight or DB commit might not have propagated.
      if (event.created * 1000 > cutoffMs) {
        skippedTooRecent++
        continue
      }

      const ref = session.client_reference_id

      // Only audit directory-order flow (premium-launch / dir_*).
      // Non-prefixed refs are for the premium-launch path; subscriptions
      // come through with `dir_` prefix in our flow.
      if (!ref) {
        // Orphan with no client_reference_id — already handled by the
        // webhook's handleOrphanPayment (auto-refunded). Surface here
        // too as an early-warning of misconfigured payment links.
        unmatched.push({
          sessionId: session.id,
          reason: "orphan_no_ref",
          createdAt: new Date(event.created * 1000).toISOString(),
          ref: null,
        })
        continue
      }
      if (!ref.startsWith(DIRECTORY_ORDER_REF_PREFIX)) {
        // Premium-launch path. Look up by projectId.
        const projectId = ref
        const [proj] = await db
          .select({ launchStatus: project.launchStatus })
          .from(project)
          .where(eq(project.id, projectId))
          .limit(1)
        totalDirectoryEvents++
        if (proj && proj.launchStatus !== "payment_pending") matched++
        else
          unmatched.push({
            sessionId: session.id,
            reason: "orphan_not_in_db",
            createdAt: new Date(event.created * 1000).toISOString(),
            ref,
          })
        continue
      }

      // Directory-order flow.
      totalDirectoryEvents++
      const orderId = ref.slice(DIRECTORY_ORDER_REF_PREFIX.length)
      const [order] = await db
        .select({
          stripeSessionId: directoryOrder.stripeSessionId,
          status: directoryOrder.status,
        })
        .from(directoryOrder)
        .where(eq(directoryOrder.id, orderId))
        .limit(1)

      if (!order) {
        unmatched.push({
          sessionId: session.id,
          reason: "orphan_not_in_db",
          createdAt: new Date(event.created * 1000).toISOString(),
          ref,
        })
        continue
      }
      // Webhook processed = order has the session id stamped on it.
      if (order.stripeSessionId === session.id) {
        matched++
      } else {
        unmatched.push({
          sessionId: session.id,
          reason: "ref_but_session_id_missing",
          createdAt: new Date(event.created * 1000).toISOString(),
          ref,
        })
      }
    }

    // Persist a snapshot of every run (healthy or degraded) so the
    // /admin/webhook-health page can render history without re-running
    // the cron.
    const previewSessionIds = unmatched.slice(0, 5).map((u) => u.sessionId)
    await db.insert(webhookHealthCheck).values({
      status: unmatched.length === 0 ? "healthy" : "degraded",
      windowHours: LOOKBACK_HOURS,
      totalEvents: events.data.length,
      directoryEvents: totalDirectoryEvents,
      matched,
      unmatched: unmatched.length,
      skippedTooRecent,
      previewSessionIds: previewSessionIds.length > 0 ? previewSessionIds : null,
    })

    // No unmatched → healthy, no email noise.
    if (unmatched.length === 0) {
      return NextResponse.json({
        status: "healthy",
        windowHours: LOOKBACK_HOURS,
        totalEvents: events.data.length,
        directoryEvents: totalDirectoryEvents,
        matched,
        skippedTooRecent,
      })
    }

    // Unmatched events found. Alert admin with first 5 session ids so
    // they can spot-check Stripe Dashboard deliveries directly.
    const preview = unmatched
      .slice(0, 5)
      .map((u) => `  - ${u.createdAt} ${u.sessionId} (${u.reason}) ref=${u.ref ?? "(none)"}`)
      .join("\n")
    const body = [
      `Stripe fired ${events.data.length} checkout.session.completed events in the last ${LOOKBACK_HOURS}h.`,
      `${matched} processed correctly by our webhook.`,
      `WARNING: ${unmatched.length} did NOT result in a DB write -- likely webhook delivery failure.`,
      ``,
      `First ${Math.min(5, unmatched.length)} unmatched:`,
      preview,
      ``,
      `Action: check Stripe Dashboard -> Developers -> Webhooks -> endpoint -> Event deliveries.`,
      `If most/all show 3xx/4xx/5xx response codes, the endpoint URL or our handler is broken.`,
    ].join("\n")

    try {
      await sendAdminPaymentNotification({
        userEmail: "webhook-health-monitor",
        amount: 0,
        currency: "usd",
        projectName: `WEBHOOK HEALTH alert: ${unmatched.length} unprocessed Stripe events in last ${LOOKBACK_HOURS}h`,
        websiteUrl: body,
        orphan: true,
      })
    } catch (err) {
      console.error("⚠️ Failed to send webhook-health alert email:", err)
    }

    return NextResponse.json({
      status: "degraded",
      windowHours: LOOKBACK_HOURS,
      totalEvents: events.data.length,
      directoryEvents: totalDirectoryEvents,
      matched,
      unmatched: unmatched.length,
      skippedTooRecent,
      previewSessionIds: unmatched.slice(0, 5).map((u) => u.sessionId),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("❌ webhook-health cron failed:", message)
    // Persist the error too so admin sees it in the dashboard. Best
    // effort — if THIS write also fails, fall through to the original
    // 500 return rather than masking the original error.
    try {
      await db.insert(webhookHealthCheck).values({
        status: "error",
        windowHours: LOOKBACK_HOURS,
        errorMessage: message,
      })
    } catch (persistErr) {
      console.error("⚠️ webhook-health: also failed to persist error row:", persistErr)
    }
    return NextResponse.json({ error: "webhook-health failed", details: message }, { status: 500 })
  }
}
