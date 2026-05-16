"use server"

import { revalidatePath } from "next/cache"
import { headers } from "next/headers"

import { db } from "@/drizzle/db"
import { directoryOrder, project, user } from "@/drizzle/db/schema"
import { routing } from "@/i18n/routing"
import { and, count, desc, eq, gt, inArray } from "drizzle-orm"
import { getLocale } from "next-intl/server"
import Stripe from "stripe"

import { logAdminAction } from "@/lib/admin-audit"
import { resolveAppUrl } from "@/lib/app-url"
import { auth } from "@/lib/auth"
import {
  DIRECTORY_ORDER_REF_PREFIX,
  getPaymentLinkUrl,
  isDirectoryTier,
  ULTRA_SPONSOR_SLOT_LIMIT,
  type DirectoryTier,
} from "@/lib/directory-tiers"

// Pinned alongside the webhook + verify route — see
// `app/api/auth/stripe/webhook/route.ts` for the rationale.
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-04-22.dahlia",
})

interface CreateInput {
  projectId: string
  tier: DirectoryTier
}

interface CreateResult {
  orderId: string
  redirectUrl: string
}

// If the same (projectId, tier, url) has a pending row younger than
// this, reuse it instead of inserting a fresh duplicate. Prevents
// table bloat from repeated Boost-button clicks without payment.
const PENDING_REUSE_WINDOW_MS = 30 * 60 * 1000 // 30 min

/**
 * Creates (or reuses) a `pending` directory_order row for the
 * current user's project and returns the Stripe Payment Link URL
 * with a `client_reference_id=dir_<orderId>` query string. The
 * caller (a client component) does the actual `window.location`
 * redirect.
 *
 * The URL stored on the order is always `project.websiteUrl` —
 * never user-supplied — so a malicious caller can't trick us into
 * later fulfilling a competitor's URL.
 *
 * The order row is inserted *before* the redirect so that:
 *   - The webhook always has a row to update on `checkout.session.completed`.
 *   - Abandoned carts leave a `pending` audit trail we can surface
 *     in the admin page if a user claims they paid but nothing
 *     happened (rare, but the hardest support case to triage).
 */
export async function createDirectoryOrder(input: CreateInput): Promise<CreateResult> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) {
    throw new Error("Unauthenticated")
  }

  if (!isDirectoryTier(input.tier)) {
    throw new Error(`Invalid tier: ${input.tier}`)
  }

  // Confirm the user actually owns the project they're paying for.
  // Without this check anyone could buy a directory listing for any
  // project id they guessed.
  const [proj] = await db
    .select({
      id: project.id,
      websiteUrl: project.websiteUrl,
      createdBy: project.createdBy,
    })
    .from(project)
    .where(and(eq(project.id, input.projectId), eq(project.createdBy, session.user.id)))
    .limit(1)

  if (!proj) {
    throw new Error("Project not found or not owned by current user")
  }

  const tier = input.tier
  const url = (proj.websiteUrl ?? "").trim()
  if (!url) {
    throw new Error("Project has no website URL")
  }

  // Ultra has a hard cap (marketing page promises "Limited to 5
  // active sponsors"). Enforce here at the checkout gate.
  //
  // This is best-effort: two parallel buyers passing the count
  // check simultaneously would both create a pending row → both
  // could pay → 6 active. The sidebar render still caps at 5 by
  // FIFO, and the over-the-cap order would simply not surface,
  // which is recoverable (admin can refund). Locking the row to
  // make this strictly atomic is overkill for a low-volume tier.
  if (tier === "ultra") {
    const taken = await countActiveUltraSlots()
    if (taken >= ULTRA_SPONSOR_SLOT_LIMIT) {
      throw new Error("Sponsor slots full — try again next month")
    }
  }

  // Resolve the payment link first so we don't write a pending row
  // when the env var is missing — keeps the orders table clean.
  const paymentLink = getPaymentLinkUrl(tier)

  // Capture the buyer's current UI locale so the post-payment email
  // can land them back on the same-locale dashboard. The webhook
  // runs out of next-intl context, so we have to remember it here.
  const buyerLocale = await getLocale()

  // Dedup: if there's a recent pending row for the same triple,
  // reuse it. Avoids accumulating one row per Boost-button click
  // when users abandon checkout and try again.
  //
  // Best-effort, not atomic: two parallel calls from the same user
  // can both miss the SELECT and both INSERT. Worst case is one
  // duplicate pending row that the next dedup pass will collapse —
  // not worth the complexity of a unique partial index here.
  const cutoff = new Date(Date.now() - PENDING_REUSE_WINDOW_MS)
  const [existing] = await db
    .select({ id: directoryOrder.id })
    .from(directoryOrder)
    .where(
      and(
        eq(directoryOrder.projectId, proj.id),
        eq(directoryOrder.tier, tier),
        eq(directoryOrder.url, url),
        eq(directoryOrder.status, "pending"),
        gt(directoryOrder.createdAt, cutoff),
      ),
    )
    .orderBy(desc(directoryOrder.createdAt))
    .limit(1)

  let orderId: string
  if (existing) {
    orderId = existing.id
  } else {
    // amountCents is intentionally NULL until the webhook stamps the
    // real Stripe-charged amount — pending rows shouldn't show a
    // claimed price that has no authority.
    const [row] = await db
      .insert(directoryOrder)
      .values({
        projectId: proj.id,
        tier,
        url,
        locale: buyerLocale,
        status: "pending",
        amountCents: null,
        currency: "usd",
      })
      .returning({ id: directoryOrder.id })
    orderId = row.id
  }

  const ref = `${DIRECTORY_ORDER_REF_PREFIX}${orderId}`
  const sep = paymentLink.includes("?") ? "&" : "?"
  const redirectUrl = `${paymentLink}${sep}client_reference_id=${encodeURIComponent(ref)}`

  return { orderId, redirectUrl }
}

/**
 * Returns a redirect URL that reuses the latest `pending`
 * directory_order for the given project (owned by the calling user)
 * with the tier the user originally chose. Falls back to creating a
 * fresh `basic` order if no pending row exists — but the dashboard
 * Resume button is only shown for payment_pending projects, which
 * always have one.
 *
 * Distinct from `createDirectoryOrder` because the dashboard doesn't
 * know which tier the user picked at submit time — pulling it from
 * the existing pending row preserves that choice instead of forcing
 * Basic on resume.
 */
export async function resumePendingDirectoryOrder(
  projectId: string,
): Promise<{ redirectUrl: string }> {
  const sess = await auth.api.getSession({ headers: await headers() })
  if (!sess?.user?.id) throw new Error("Unauthenticated")

  const [proj] = await db
    .select({ id: project.id })
    .from(project)
    .where(and(eq(project.id, projectId), eq(project.createdBy, sess.user.id)))
    .limit(1)
  if (!proj) throw new Error("Project not found or not owned")

  const [existing] = await db
    .select({ id: directoryOrder.id, tier: directoryOrder.tier })
    .from(directoryOrder)
    .where(and(eq(directoryOrder.projectId, projectId), eq(directoryOrder.status, "pending")))
    .orderBy(desc(directoryOrder.createdAt))
    .limit(1)

  if (existing && isDirectoryTier(existing.tier)) {
    const paymentLink = getPaymentLinkUrl(existing.tier)
    const ref = `${DIRECTORY_ORDER_REF_PREFIX}${existing.id}`
    const sep = paymentLink.includes("?") ? "&" : "?"
    return { redirectUrl: `${paymentLink}${sep}client_reference_id=${encodeURIComponent(ref)}` }
  }

  // No pending row — defensive fallback. Creates a fresh basic order.
  const { redirectUrl } = await createDirectoryOrder({ projectId, tier: "basic" })
  return { redirectUrl }
}

// ─── Pending-order cancellation ───

interface CancelResult {
  canceled: boolean
  expiredSessions: number
}

/**
 * Cancels any `pending` directory_order rows tied to the given project
 * (owned by the calling user), expires any open Stripe Checkout
 * Sessions for them, and deletes the project. Use this when a user
 * abandons a pending-payment flow and wants to start over — it closes
 * the Stripe-side door so the abandoned link can't later mint an
 * orphan payment (project gone → directory_order CASCADE-gone →
 * webhook 200s silently).
 *
 * Idempotent: zero-pending case returns canceled=true with 0 sessions
 * touched (still deletes the project, which is the caller's intent).
 */
export async function cancelPendingDirectoryOrder(projectId: string): Promise<CancelResult> {
  const sess = await auth.api.getSession({ headers: await headers() })
  if (!sess?.user?.id) {
    throw new Error("Unauthenticated")
  }

  // Ownership + state guard. Only payment_pending projects (which
  // genuinely have a Stripe session in flight) need this dance. For
  // payment_failed / SCHEDULED / launched the caller should use
  // the normal delete path.
  const [proj] = await db
    .select({ id: project.id, launchStatus: project.launchStatus })
    .from(project)
    .where(and(eq(project.id, projectId), eq(project.createdBy, sess.user.id)))
    .limit(1)
  if (!proj) throw new Error("Project not found or not owned")
  if (proj.launchStatus !== "payment_pending") {
    throw new Error("Project is not in payment_pending state")
  }

  const pendingOrders = await db
    .select({ id: directoryOrder.id })
    .from(directoryOrder)
    .where(and(eq(directoryOrder.projectId, projectId), eq(directoryOrder.status, "pending")))

  let expiredSessions = 0
  for (const order of pendingOrders) {
    const ref = `${DIRECTORY_ORDER_REF_PREFIX}${order.id}`
    try {
      // Stripe search supports `client_reference_id` and `status`. Open
      // sessions are the dangerous ones — a `complete`/`expired`
      // session can't be paid against anymore so we don't care.
      //
      // `as any`: `checkout.sessions.search` is a live Stripe endpoint
      // and works at runtime, but isn't in the v17 SDK typings.
      const searchClient = stripe.checkout.sessions as unknown as {
        search: (opts: {
          query: string
          limit?: number
        }) => Promise<{ data: Array<{ id: string }> }>
      }
      const result = await searchClient.search({
        query: `client_reference_id:'${ref}' AND status:'open'`,
        limit: 5,
      })
      for (const s of result.data) {
        try {
          await stripe.checkout.sessions.expire(s.id)
          expiredSessions++
        } catch (err) {
          // A session may already be expired by Stripe (24h auto-expiry)
          // — log but don't fail the whole cancel flow.
          console.error("⚠️ Failed to expire Stripe session", s.id, err)
        }
      }
    } catch (err) {
      // Search API can fail if the indexed copy is stale — proceed with
      // local DB cleanup anyway. Worst case: a session stays open for
      // up to 24h; the webhook's orphan-payment alert will catch any
      // money that slips through.
      console.error("⚠️ Stripe session search failed for ref", ref, err)
    }
    await db
      .update(directoryOrder)
      .set({ status: "canceled", updatedAt: new Date() })
      .where(and(eq(directoryOrder.id, order.id), eq(directoryOrder.status, "pending")))
  }

  // Project delete cascades the (now-canceled) directory_order rows;
  // keeping them as `canceled` first means if a Stripe session somehow
  // pays AFTER expire returned, the orphan alert + audit trail still
  // surface the issue cleanly.
  await db.delete(project).where(eq(project.id, projectId))

  return { canceled: true, expiredSessions }
}

// ─── Sponsor slot accounting ───

/**
 * How many Ultra orders are currently active (paid or fulfilled).
 * "Active" maps to a sidebar slot — canceled / refunded / failed
 * rows have already vacated their slot via webhook.
 *
 * Internal helper — not exported as a server action so we don't
 * widen the public surface. Public callers go through
 * `getUltraSlotInfo()` below.
 */
async function countActiveUltraSlots(): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(directoryOrder)
    .where(
      and(eq(directoryOrder.tier, "ultra"), inArray(directoryOrder.status, ["paid", "fulfilled"])),
    )
  return row?.n ?? 0
}

interface UltraSlotInfo {
  taken: number
  limit: number
  available: boolean
}

/**
 * Compact projection of slot state for the dashboard's Boost menu.
 * Cheap (`COUNT(*)`) so it's safe to call inline during dashboard
 * render.
 *
 * The numbers behind it are public-ish: the marketing page already
 * advertises the 5-slot cap, so leaking "taken: 3" via a server
 * action probe doesn't reveal anything sensitive.
 */
export async function getUltraSlotInfo(): Promise<UltraSlotInfo> {
  const taken = await countActiveUltraSlots()
  return {
    taken,
    limit: ULTRA_SPONSOR_SLOT_LIMIT,
    available: taken < ULTRA_SPONSOR_SLOT_LIMIT,
  }
}

// ─── Subscription self-service ───

/**
 * Returns project IDs (from the input list) that currently have an
 * active Ultra subscription order *and* are owned by the calling
 * user. "Active" = status in (`paid`, `fulfilled`) for tier `ultra`.
 * Used by the dashboard to decide whether to render the "Manage
 * subscription" button.
 *
 * The ownership join is critical: without it the action would let
 * any caller probe whether arbitrary project IDs hold an Ultra
 * subscription — a binary information leak.
 *
 * Empty input returns an empty Set without hitting the DB.
 */
export async function getActiveUltraProjectIds(projectIds: string[]): Promise<Set<string>> {
  if (projectIds.length === 0) return new Set()

  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) {
    throw new Error("Unauthenticated")
  }

  const rows = await db
    .select({ projectId: directoryOrder.projectId })
    .from(directoryOrder)
    .innerJoin(project, eq(project.id, directoryOrder.projectId))
    .where(
      and(
        inArray(directoryOrder.projectId, projectIds),
        eq(project.createdBy, session.user.id),
        eq(directoryOrder.tier, "ultra"),
        inArray(directoryOrder.status, ["paid", "fulfilled"]),
      ),
    )
    // GROUP BY projectId so a project with multiple historical Ultra
    // orders (resubscribe / cancel / resubscribe) collapses to one
    // row instead of N. Final Set dedup would catch this anyway, but
    // shrinking the result set early avoids paying for the wasted
    // bytes over the wire.
    .groupBy(directoryOrder.projectId)

  return new Set(rows.map((r) => r.projectId))
}

interface PortalResult {
  redirectUrl: string
}

/**
 * Creates a Stripe Customer Portal session for the current user's
 * Ultra subscription on the given project, and returns the URL to
 * redirect the user to. The portal lets them cancel / change
 * payment method / view invoices without us building UI for any
 * of that.
 *
 * Best practice: use the Customer Portal for self-service
 * subscription management instead of building cancel buttons.
 *
 * Requires the Customer Portal to be configured in the Stripe
 * Dashboard (Settings → Customer Portal); the SDK call fails with
 * a clear error if it isn't.
 */
export async function createCustomerPortalSession(projectId: string): Promise<PortalResult> {
  const sess = await auth.api.getSession({ headers: await headers() })
  if (!sess?.user?.id) {
    throw new Error("Unauthenticated")
  }

  // Find the active Ultra order for this project owned by the
  // current user. Joining through project enforces ownership.
  const [row] = await db
    .select({
      stripeCustomerId: directoryOrder.stripeCustomerId,
    })
    .from(directoryOrder)
    .innerJoin(project, eq(project.id, directoryOrder.projectId))
    .where(
      and(
        eq(directoryOrder.projectId, projectId),
        eq(directoryOrder.tier, "ultra"),
        inArray(directoryOrder.status, ["paid", "fulfilled"]),
        eq(project.createdBy, sess.user.id),
      ),
    )
    .orderBy(desc(directoryOrder.createdAt))
    .limit(1)

  if (!row?.stripeCustomerId) {
    throw new Error("No active Ultra subscription for this project")
  }

  // Build a return URL that preserves the user's locale. With
  // `localePrefix: "as-needed"` the default locale ("en") has no
  // prefix; everything else gets a `/<locale>` segment. Without
  // this the user would be sent back to the English dashboard
  // regardless of which language they were browsing in.
  const baseUrl = resolveAppUrl()
  const locale = await getLocale()
  const localePath = locale === routing.defaultLocale ? "" : `/${locale}`
  const portalSession = await stripe.billingPortal.sessions.create({
    customer: row.stripeCustomerId,
    return_url: `${baseUrl}${localePath}/dashboard`,
  })

  return { redirectUrl: portalSession.url }
}

// ─── Admin actions ───

async function checkAdminAccess(): Promise<{ adminId: string }> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.role || session.user.role !== "admin") {
    throw new Error("Unauthorized: Admin access required")
  }
  return { adminId: session.user.id }
}

export interface AdminDirectoryOrderRow {
  id: string
  projectId: string
  projectName: string | null
  projectSlug: string | null
  buyerEmail: string | null
  tier: string
  url: string
  status: string
  amountCents: number | null
  currency: string | null
  paidAt: Date | null
  fulfilledAt: Date | null
  adminNotes: string | null
  createdAt: Date
  stripeSessionId: string | null
  stripeSubscriptionId: string | null
}

/**
 * Lists directory orders for the admin queue. Joins to project for
 * the display name + slug, and to user (via project.createdBy) for
 * the buyer email — saves the admin a tab when chasing up an
 * order. Sort: newest paid first (so the queue surfaces what needs
 * fulfilling), then everything else by created_at desc.
 */
export async function listDirectoryOrders(): Promise<AdminDirectoryOrderRow[]> {
  await checkAdminAccess()

  const rows = await db
    .select({
      id: directoryOrder.id,
      projectId: directoryOrder.projectId,
      projectName: project.name,
      projectSlug: project.slug,
      buyerEmail: user.email,
      tier: directoryOrder.tier,
      url: directoryOrder.url,
      status: directoryOrder.status,
      amountCents: directoryOrder.amountCents,
      currency: directoryOrder.currency,
      paidAt: directoryOrder.paidAt,
      fulfilledAt: directoryOrder.fulfilledAt,
      adminNotes: directoryOrder.adminNotes,
      createdAt: directoryOrder.createdAt,
      stripeSessionId: directoryOrder.stripeSessionId,
      stripeSubscriptionId: directoryOrder.stripeSubscriptionId,
    })
    .from(directoryOrder)
    .leftJoin(project, eq(project.id, directoryOrder.projectId))
    .leftJoin(user, eq(user.id, project.createdBy))
    .orderBy(desc(directoryOrder.paidAt), desc(directoryOrder.createdAt))

  return rows
}

/**
 * Flips an order from `paid` → `fulfilled`. The status guard in the
 * WHERE clause makes this idempotent — clicking twice from two
 * tabs won't double-stamp `fulfilledBy`.
 */
export async function markDirectoryOrderFulfilled(orderId: string): Promise<{ ok: boolean }> {
  const { adminId } = await checkAdminAccess()

  const result = await db
    .update(directoryOrder)
    .set({
      status: "fulfilled",
      fulfilledAt: new Date(),
      fulfilledBy: adminId,
      updatedAt: new Date(),
    })
    .where(and(eq(directoryOrder.id, orderId), eq(directoryOrder.status, "paid")))

  if (!result.rowCount || result.rowCount === 0) {
    throw new Error("Order is not in a fulfillable state (must be `paid`)")
  }

  // Audit log so /admin/audit shows who fulfilled what + when. Best
  // effort — a logging failure shouldn't undo the fulfilment that
  // already committed above.
  try {
    await logAdminAction({
      adminUserId: adminId,
      action: "directory_order.fulfill",
      targetType: "directory_order",
      targetId: orderId,
    })
  } catch (err) {
    console.error("Failed to write admin audit log for directory_order.fulfill:", err)
  }

  revalidatePath("/admin/directory-orders")
  return { ok: true }
}
