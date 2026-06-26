"use server"

import { revalidatePath } from "next/cache"
import { headers } from "next/headers"

import { db } from "@/drizzle/db"
import { directoryOrder, launchSyndication, project, user } from "@/drizzle/db/schema"
import { and, desc, eq, gt } from "drizzle-orm"
import { getLocale } from "next-intl/server"

import { logAdminAction } from "@/lib/admin-audit"
import { auth } from "@/lib/auth"
import {
  DIRECTORY_ORDER_REF_PREFIX,
  getPaymentLinkUrl,
  isDirectoryTier,
  type DirectoryTier,
} from "@/lib/directory-tiers"
import { collectPublishedUrls } from "@/lib/launch-syndication"
import { sendListingLiveEmail } from "@/lib/transactional-emails"

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
}

/**
 * Cancels any `pending` directory_order rows tied to the given project
 * (owned by the calling user) and deletes the project. Use this when a
 * user abandons a pending-payment flow and wants to start over.
 *
 * We can't close the Stripe-side session here (Payment Links create it
 * lazily, so we never hold its id, and there's no API to find it by
 * `client_reference_id`). If the abandoned link is paid after cancel, the
 * webhook catches it: the order is `canceled`, so it routes to
 * `handleOrphanPayment` (auto-refund + admin alert) rather than fulfilling.
 *
 * Idempotent: the zero-pending case still returns canceled=true and deletes
 * the project, which is the caller's intent.
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

  // We can't proactively expire the open Stripe Checkout Session here:
  // Payment Links create the session only when the buyer opens the link, so
  // we never learn its id, and Stripe has no API to look a session up by
  // `client_reference_id` (Search doesn't cover Checkout Sessions, and
  // `sessions.list` can't filter by it). We instead rely on two safety nets:
  // Stripe auto-expires an unpaid session after 24h, and if a payment still
  // lands on a now-`canceled` order the webhook routes it to
  // `handleOrphanPayment` (auto-refund + admin alert). So just cancel locally.
  for (const order of pendingOrders) {
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

  return { canceled: true }
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
  amountVerified: boolean
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
      amountVerified: directoryOrder.amountVerified,
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
    .where(
      and(
        eq(directoryOrder.id, orderId),
        eq(directoryOrder.status, "paid"),
        // Don't let an admin fulfil an amount-mismatch order still held for review.
        eq(directoryOrder.amountVerified, true),
      ),
    )

  if (!result.rowCount || result.rowCount === 0) {
    // Give a specific message when the block is the held-for-review flag.
    const [ord] = await db
      .select({ status: directoryOrder.status, amountVerified: directoryOrder.amountVerified })
      .from(directoryOrder)
      .where(eq(directoryOrder.id, orderId))
      .limit(1)
    if (ord?.status === "paid" && ord.amountVerified === false) {
      throw new Error(
        "Order is held for review (amount mismatch) — verify the payment before fulfilling.",
      )
    }
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

  // Best-effort: email the buyer the published partner URLs — the same email
  // the auto-fulfil cron sends for plus/pro. This covers the manual path
  // (Ultra / Ultra Plus, or a cleared held order). Only the winning flip
  // reaches here (rowCount>0 guard above), so it's sent at most once, and
  // plus/pro never reach this path — the cron fulfils them first. Sent only
  // when syndication has actually produced URLs; if it hasn't finished yet
  // there's nothing to send (rare for Ultra, fulfilled days later).
  try {
    const [ord] = await db
      .select({
        tier: directoryOrder.tier,
        locale: directoryOrder.locale,
        buyerEmail: directoryOrder.buyerEmail,
        buyerName: directoryOrder.buyerName,
        projectName: project.name,
      })
      .from(directoryOrder)
      .leftJoin(project, eq(project.id, directoryOrder.projectId))
      .where(eq(directoryOrder.id, orderId))
      .limit(1)
    if (ord?.buyerEmail) {
      const synRows = await db
        .select({
          status: launchSyndication.status,
          externalUrl: launchSyndication.externalUrl,
          externalUrls: launchSyndication.externalUrls,
        })
        .from(launchSyndication)
        .where(eq(launchSyndication.orderId, orderId))
      // Only send once syndication is fully delivered — otherwise the buyer
      // would get a partial list and, since the order is now `fulfilled`, the
      // cron would never send the completed one later. Mirrors the cron's
      // `complete` check.
      const allSent = synRows.length > 0 && synRows.every((r) => r.status === "sent")
      const urls = allSent ? collectPublishedUrls(synRows) : []
      if (urls.length > 0) {
        await sendListingLiveEmail({
          buyerEmail: ord.buyerEmail,
          buyerName: ord.buyerName,
          tier: ord.tier as DirectoryTier,
          projectName: ord.projectName ?? "your project",
          locale: ord.locale,
          urls,
        })
      }
    }
  } catch (err) {
    console.error("Failed to send listing-live email on manual fulfil:", orderId, err)
  }

  revalidatePath("/admin/directory-orders")
  return { ok: true }
}
