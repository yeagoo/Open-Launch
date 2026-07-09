import { revalidatePath } from "next/cache"
import { NextResponse } from "next/server"

import { db } from "@/drizzle/db"
import {
  directoryOrder,
  launchQuota,
  launchStatus,
  launchSyndication,
  project,
} from "@/drizzle/db/schema"
import { and, eq, inArray, sql } from "drizzle-orm"
import type Stripe from "stripe"

import { LAUNCH_SETTINGS } from "@/lib/constants"
import {
  DIRECTORY_ORDER_REF_PREFIX,
  DIRECTORY_TIER_CONFIG,
  isDirectoryTier,
  type DirectoryTier,
} from "@/lib/directory-tiers"
import { enqueueLaunchSyndication } from "@/lib/launch-syndication"
import { dedupeOnce } from "@/lib/rate-limit"
import { createStripeClient } from "@/lib/stripe"
import {
  sendAdminPaymentNotification,
  sendBuyerDirectoryOrderConfirmation,
} from "@/lib/transactional-emails"

// Expected charge for a legacy Premium Launch, in cents.
const PREMIUM_PRICE_CENTS = Math.round(LAUNCH_SETTINGS.PREMIUM_PRICE * 100)

// All prices in this app are USD; `amount_total` is only meaningful as a
// price check when the session is actually in USD (399 JPY would otherwise
// satisfy a 399-USD-cent comparison).
const EXPECTED_CURRENCY = "usd"

/**
 * True when the amount actually charged matches the expected price AND the
 * session is in the expected currency. Promotion codes legitimately lower
 * `amount_total`, so the discount is added back before comparing. A wrong
 * currency, or a non-numeric `amount_total` (malformed / zero-amount
 * session), is treated as a mismatch so it is held for review rather than
 * silently trusted.
 */
function chargedAmountMatches(session: Stripe.Checkout.Session, expectedCents: number): boolean {
  if (session.currency !== EXPECTED_CURRENCY) return false
  if (typeof session.amount_total !== "number") return false
  const discountCents = session.total_details?.amount_discount ?? 0
  return session.amount_total + discountCents === expectedCents
}

/**
 * Cancel a directory_order tied to a LEGACY Ultra subscription that's no
 * longer billable. Ultra is now a one-time tier; these handlers remain only
 * as a safety net for any pre-redesign subscription still active in Stripe.
 * Stripe fires both `subscription.deleted` AND
 * `subscription.updated[status=canceled]` for a single cancel — the
 * WHERE clause restricts to paid/fulfilled so the second hit is a
 * 0-row no-op, and `revalidateTag` only runs when we actually changed
 * the row. Accepts both `paid` and `fulfilled` because Plus/Pro/Ultra
 * orders sit at `paid` until the admin manually marks them fulfilled,
 * and a customer can cancel before that step.
 */
async function markUltraOrderCanceled(stripeSubscriptionId: string, reason: string) {
  const canceled = await db
    .update(directoryOrder)
    .set({ status: "canceled", updatedAt: new Date() })
    .where(
      and(
        eq(directoryOrder.stripeSubscriptionId, stripeSubscriptionId),
        inArray(directoryOrder.status, ["paid", "fulfilled"]),
      ),
    )
    .returning({ id: directoryOrder.id })
  if (canceled.length === 0) {
    console.log(
      "ℹ️ subscription cancel signal for unknown / already-canceled order:",
      stripeSubscriptionId,
      "reason:",
      reason,
    )
    return
  }
  // Stop syndicating a canceled order: drop rows not yet posted. Already-`sent`
  // partner listings are left live (Ultra cancel keeps existing listings).
  await db.delete(launchSyndication).where(
    and(
      inArray(
        launchSyndication.orderId,
        canceled.map((r) => r.id),
      ),
      inArray(launchSyndication.status, ["pending", "failed"]),
    ),
  )
  console.log("✅ Subscription dead, marked order canceled:", stripeSubscriptionId, "via", reason)
}

/**
 * Dedup so a webhook resend doesn't email admin twice for the same
 * orphan. Redis-backed (`dedupeOnce`) so it survives restarts and
 * works across instances; degrades to a per-process map if Redis is
 * down. 1h TTL window — same orphan within the hour is treated as a
 * duplicate (typical when admin resends a batch); outside the window
 * the email re-fires (legitimate "this came back" signal).
 *
 * Refunds still always run — `stripe.refunds.create` is given an
 * idempotency key on session.id, so Stripe handles dedup at its layer
 * without our help. This only suppresses the email noise.
 */
const ORPHAN_DEDUP_TTL_S = 60 * 60 // 1h

function shouldEmailOrphan(sessionId: string): Promise<boolean> {
  return dedupeOnce(`orphan-email:${sessionId}`, ORPHAN_DEDUP_TTL_S)
}

/**
 * Orphan payment handler: webhook got a paid checkout that doesn't
 * match any project or order in our DB. Two scenarios produce this:
 *   1. Customer hit a raw Stripe Payment Link without going through
 *      `/projects/submit` → `createDirectoryOrder` → so no
 *      `client_reference_id=dir_<uuid>` was set.
 *   2. The matching project/order got deleted between Stripe accepting
 *      the payment and the webhook landing (cascade-delete from a
 *      `payment_pending` re-submit, already mitigated in
 *      `submitProject`).
 *
 * Either way the customer paid for nothing renderable in our system.
 * Hard fix: **auto-refund** so the money never sits in limbo, the
 * customer sees a "refunded" notification from Stripe within seconds,
 * and they're forced back through the proper submit flow if they
 * actually want a listing. Then alert admin so we have a paper trail.
 *
 * For subscription (Ultra) orphans we also cancel the subscription so
 * it doesn't keep billing. The first invoice's `payment_intent` is on
 * `invoice.payment_intent`, not `session.payment_intent` (which is
 * null in subscription mode), so we fetch the invoice via the
 * subscription's `latest_invoice` link.
 *
 * Cost note: Stripe keeps processing fees on refunds (~$0.30 fixed +
 * 2.9% variable in most regions). We accept that as the cost of
 * preventing customer-stuck-with-no-service.
 *
 * Idempotency: webhook retries can call this handler multiple times
 * for the same session. `stripe.refunds.create` is given a stable
 * idempotency key keyed off `session.id` so duplicate calls return
 * the existing refund object instead of double-refunding.
 * `subscriptions.cancel` is naturally idempotent (already-canceled
 * subs return as-is).
 *
 * Best-effort: any sub-step failure logs and falls through. The
 * webhook still returns 200 so Stripe doesn't retry forever.
 */
async function handleOrphanPayment(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
  reason: string,
  ref: string | null,
) {
  const userEmail = session.customer_details?.email ?? "unknown"
  const amount = (session.amount_total ?? 0) / 100
  const currency = session.currency ?? "usd"

  let refundOutcome: string
  try {
    let paymentIntentId: string | null = null

    if (session.mode === "subscription") {
      // Subscription orphan: cancel the sub + refund the FIRST invoice.
      const subId =
        typeof session.subscription === "string"
          ? session.subscription
          : (session.subscription?.id ?? null)
      if (!subId) {
        refundOutcome = "subscription mode but no subscription id on session — cannot act"
      } else {
        // Single call: cancel AND pull latest_invoice.payments in one
        // round trip. Cancel is naturally idempotent (already-canceled
        // returns as-is). First invoice's PaymentIntent isn't on
        // `session.payment_intent` (null in sub mode); under the dahlia
        // (2026-04-22) API `invoice.payment_intent` direct field is
        // gone too — new path is `invoice.payments.data[0].payment
        // .payment_intent`.
        const sub = await stripe.subscriptions.cancel(subId, {
          invoice_now: false,
          prorate: false,
          expand: ["latest_invoice.payments"],
        })
        refundOutcome = `subscription ${subId} canceled`

        const latestInvoice = sub.latest_invoice
        if (latestInvoice && typeof latestInvoice !== "string") {
          const firstPayment = latestInvoice.payments?.data[0]
          if (firstPayment?.payment?.type === "payment_intent") {
            const pi = firstPayment.payment.payment_intent
            paymentIntentId = typeof pi === "string" ? pi : (pi?.id ?? null)
          }
        }
        if (!paymentIntentId) {
          // Subscription canceled successfully but we couldn't find a
          // PaymentIntent on the first invoice. Make this explicit in
          // the admin email — without this note, "subscription X
          // canceled" reads like "fully handled" when in fact the
          // first month's charge is still on the customer's card.
          refundOutcome +=
            " (no PaymentIntent on first invoice — MANUAL REFUND NEEDED for the initial charge)"
        }
      }
    } else {
      // One-shot payment (Basic/Plus/Pro): payment_intent is right on the session.
      paymentIntentId =
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : (session.payment_intent?.id ?? null)
      refundOutcome = ""
    }

    if (paymentIntentId) {
      // Idempotency key off session.id — webhook retries land on the
      // same key, Stripe returns the existing refund instead of a
      // second one. Format is opaque to Stripe; just needs to be
      // stable per logical operation (max 255 chars).
      const refund = await stripe.refunds.create(
        { payment_intent: paymentIntentId },
        { idempotencyKey: `orphan-refund-${session.id}` },
      )
      const refundLabel = `refund ${refund.id} for $${amount} ${currency.toUpperCase()}`
      refundOutcome = refundOutcome ? `${refundOutcome} + ${refundLabel}` : refundLabel
    } else if (!refundOutcome) {
      refundOutcome = "no payment_intent resolvable — cannot refund automatically"
    }
  } catch (err) {
    refundOutcome = `AUTO-REFUND FAILED: ${err instanceof Error ? err.message : String(err)} — manual refund required`
    console.error("⚠️ Orphan auto-refund failed:", err)
  }

  // Email admin — paper trail of every orphan + which root cause
  // (none-ref / project-gone / order-gone) hit production. Suppress
  // duplicate emails when the same session.id hits within the dedup
  // window (typical when admin manually resends a webhook batch).
  if (!(await shouldEmailOrphan(session.id))) {
    console.log("ℹ️ Suppressed duplicate orphan alert email for session:", session.id)
    return
  }
  try {
    await sendAdminPaymentNotification({
      userEmail,
      amount,
      currency,
      projectName: `${reason} — ${refundOutcome}`,
      websiteUrl: `Stripe session: ${session.id} | client_reference_id: ${ref ?? "(none)"}`,
      orphan: true,
    })
  } catch (err) {
    console.error("⚠️ Failed to send orphan-payment alert email:", err)
  }
}

export async function POST(request: Request) {
  try {
    // 检查环境变量是否配置
    const stripe = createStripeClient()
    if (!stripe) {
      console.error("❌ STRIPE_SECRET_KEY is not configured")
      return NextResponse.json({ error: "Stripe configuration error" }, { status: 500 })
    }

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
    if (!webhookSecret) {
      console.error("❌ STRIPE_WEBHOOK_SECRET is not configured")
      return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 })
    }

    const body = await request.text()
    const signature = request.headers.get("stripe-signature") as string

    if (!signature) {
      console.error("❌ No stripe-signature header found")
      return NextResponse.json({ error: "No signature header" }, { status: 400 })
    }

    // Vérifier la signature du webhook
    let event: Stripe.Event
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
      console.log("✅ Webhook signature verified, event type:", event.type)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error"
      console.error("❌ Webhook signature verification failed:", errorMessage)
      return NextResponse.json({ error: "Webhook signature verification failed" }, { status: 400 })
    }

    // Traiter l'événement
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session

      // Branch: directory-listing orders use a `dir_<orderId>` prefix on
      // `client_reference_id` so they don't collide with bare project
      // ids that the premium-launch flow uses.
      const ref = session.client_reference_id
      if (ref?.startsWith(DIRECTORY_ORDER_REF_PREFIX)) {
        return await handleDirectoryOrderCompleted(stripe, session, ref)
      }

      // Find the project using client_reference_id (which we set as projectId)
      const projectId = ref
      if (!projectId) {
        console.error("⚠️ No project ID found in session metadata, session_id:", session.id)
        // 返回 200 避免 Stripe 重试，但发管理员告警
        await handleOrphanPayment(stripe, session, "no client_reference_id", null)
        return NextResponse.json({ received: true, warning: "No project ID" }, { status: 200 })
      }

      console.log("📦 Processing payment for project:", projectId)

      // Vérifier si le paiement a réussi
      if (session.payment_status === "paid") {
        // Récupérer les informations de la chaîne
        const [projectData] = await db
          .select({
            id: project.id,
            name: project.name,
            websiteUrl: project.websiteUrl,
            launchType: project.launchType,
            launchStatus: project.launchStatus,
            scheduledLaunchDate: project.scheduledLaunchDate,
            premiumPriceCents: project.premiumPriceCents,
          })
          .from(project)
          .where(eq(project.id, projectId))

        if (!projectData) {
          console.error("⚠️ Project not found:", projectId)
          // 返回 200 避免 Stripe 无限重试,同时发管理员告警
          await handleOrphanPayment(stripe, session, `project ${projectId} not found`, projectId)
          return NextResponse.json(
            { received: true, warning: "Project not found" },
            { status: 200 },
          )
        }

        if (!projectData.scheduledLaunchDate) {
          console.error("⚠️ Project data incomplete:", projectId)
          return NextResponse.json(
            { received: true, warning: "Project data incomplete" },
            { status: 200 },
          )
        }

        console.log("✅ Project found, scheduled date:", projectData.scheduledLaunchDate)

        // Server-side price guard. `client_reference_id` on a Stripe
        // Payment Link is attacker-controllable (`?client_reference_id=`),
        // so a paid session pointing at this project could have been
        // created against any cheaper price. Verify the charged amount
        // (discount added back for promo codes) before granting the paid
        // launch. On mismatch: leave the project in PAYMENT_PENDING and
        // alert admin instead of scheduling it.
        //
        // Gated on PAYMENT_PENDING so this only fires on FIRST processing:
        // a replayed/already-processed session (project already SCHEDULED)
        // is handled idempotently below instead of refunding a legitimate
        // payment. Validate against the price captured at schedule time
        // (premiumPriceCents) — falling back to the live constant only for
        // legacy rows — so a later PREMIUM_PRICE change can't refund an
        // in-flight session created at the old price.
        const expectedPremiumCents = projectData.premiumPriceCents ?? PREMIUM_PRICE_CENTS
        if (
          projectData.launchStatus === launchStatus.PAYMENT_PENDING &&
          !chargedAmountMatches(session, expectedPremiumCents)
        ) {
          console.error(
            `⚠️ Premium amount mismatch — scheduling HELD. expected=${expectedPremiumCents}¢, stripe=${session.amount_total}, discount=${session.total_details?.amount_discount ?? 0}, project=${projectId}`,
          )
          await handleOrphanPayment(
            stripe,
            session,
            `premium amount mismatch (expected ${expectedPremiumCents}¢) for project ${projectId}`,
            projectId,
          )
          return NextResponse.json(
            { received: true, warning: "Amount mismatch — held for review" },
            { status: 200 },
          )
        }

        // Atomic conditional update: only transition PAYMENT_PENDING → SCHEDULED
        // The WHERE clause ensures only the first writer (verify or webhook) succeeds
        const updateResult = await db
          .update(project)
          .set({
            launchStatus: launchStatus.SCHEDULED,
            featuredOnHomepage: false,
            updatedAt: new Date(),
          })
          .where(
            and(eq(project.id, projectId), eq(project.launchStatus, launchStatus.PAYMENT_PENDING)),
          )

        // Only update quota if THIS request actually performed the transition
        if (!updateResult.rowCount || updateResult.rowCount === 0) {
          console.log("ℹ️ Project already processed by verify endpoint, skipping quota update")
        } else {
          console.log("✅ Webhook: Payment confirmed for project:", projectId)

          revalidatePath("/sitemap.xml")

          const launchDate = projectData.scheduledLaunchDate
          const quotaResult = await db
            .select()
            .from(launchQuota)
            .where(eq(launchQuota.date, launchDate))
            .limit(1)

          if (quotaResult.length === 0) {
            await db.insert(launchQuota).values({
              id: crypto.randomUUID(),
              date: launchDate,
              freeCount: 0,
              badgeCount: 0,
              premiumCount: 1,
              createdAt: new Date(),
              updatedAt: new Date(),
            })
          } else {
            await db
              .update(launchQuota)
              .set({
                premiumCount: sql`${launchQuota.premiumCount} + 1`,
                updatedAt: new Date(),
              })
              .where(eq(launchQuota.id, quotaResult[0].id))
          }

          try {
            revalidatePath(`/projects`)
            console.log(`✅ Revalidated path for project: ${projectId}`)
          } catch (revalidateError) {
            console.error("⚠️ Error revalidating path:", revalidateError)
          }
        }

        // Send admin notification
        try {
          const userEmail = session.customer_details?.email || "unknown@example.com"
          const amount = (session.amount_total || 0) / 100
          const currency = session.currency || "usd"

          await sendAdminPaymentNotification({
            userEmail,
            amount,
            currency,
            projectName: projectData.name || "Unknown Project",
            websiteUrl: projectData.websiteUrl || "https://aat.ee",
          })
          console.log("✅ Admin payment notification sent")
        } catch (emailError) {
          console.error("⚠️ Failed to send admin notification:", emailError)
        }

        console.log("✅ Webhook processed successfully for project:", projectId)
        return NextResponse.json({ success: true }, { status: 200 })
      } else {
        // Si le paiement n'a pas réussi, mettre à jour le statut à PAYMENT_FAILED
        console.log("⚠️ Payment not completed, status:", session.payment_status)
        await db
          .update(project)
          .set({
            launchStatus: launchStatus.PAYMENT_FAILED,
            updatedAt: new Date(),
          })
          .where(eq(project.id, projectId))

        return NextResponse.json({ success: true }, { status: 200 })
      }
    } else if (event.type === "checkout.session.async_payment_succeeded") {
      // Delayed-payment methods (SEPA, ACH, bank transfer) fire
      // `completed` with status `unpaid`, then this event when the
      // funds settle. For directory orders we route both through the
      // same handler — `payment_status` will now be `paid` so the
      // status flip happens here.
      const session = event.data.object as Stripe.Checkout.Session
      const ref = session.client_reference_id
      if (ref?.startsWith(DIRECTORY_ORDER_REF_PREFIX)) {
        return await handleDirectoryOrderCompleted(stripe, session, ref)
      }
      // Premium-launch flow uses card-only checkout, so async_payment
      // events shouldn't hit this branch; log and acknowledge.
      console.log("ℹ️ async_payment_succeeded for non-directory order:", ref)
      return NextResponse.json({ received: true }, { status: 200 })
    } else if (event.type === "checkout.session.async_payment_failed") {
      const session = event.data.object as Stripe.Checkout.Session
      const ref = session.client_reference_id
      if (ref?.startsWith(DIRECTORY_ORDER_REF_PREFIX)) {
        const orderId = ref.slice(DIRECTORY_ORDER_REF_PREFIX.length)
        await db
          .update(directoryOrder)
          .set({ status: "failed", updatedAt: new Date() })
          .where(and(eq(directoryOrder.id, orderId), eq(directoryOrder.status, "pending")))
        console.log("✅ Marked directory order as failed (async):", orderId)
      }
      return NextResponse.json({ success: true }, { status: 200 })
    } else if (event.type === "customer.subscription.deleted") {
      // Legacy: Ultra used to be a subscription. For any pre-redesign Ultra
      // subscription still active in Stripe, when it's canceled (by user or
      // admin) flip the matching order to `canceled` so the admin queue stops
      // treating it as active. New Ultra orders are one-time (no subscription).
      const sub = event.data.object as Stripe.Subscription
      await markUltraOrderCanceled(sub.id, "deleted")
      return NextResponse.json({ success: true }, { status: 200 })
    } else if (event.type === "customer.subscription.updated") {
      // Stripe fires `updated` for every state transition. We only act
      // on the three terminal-death states (subscription effectively
      // gone) and treat them as a cancel-equivalent for our directory
      // order. Healthy transitions (active, trialing, past_due-pending-
      // retry, paused) are no-ops — kicking customers on past_due would
      // punish them mid-retry-window.
      const sub = event.data.object as Stripe.Subscription
      const DEAD_STATUSES: ReadonlyArray<Stripe.Subscription.Status> = [
        "incomplete_expired",
        "unpaid",
        "canceled",
      ]
      if (!DEAD_STATUSES.includes(sub.status)) {
        return NextResponse.json({ success: true, noop: true }, { status: 200 })
      }
      await markUltraOrderCanceled(sub.id, `updated[${sub.status}]`)
      return NextResponse.json({ success: true }, { status: 200 })
    } else if (event.type === "checkout.session.expired") {
      const session = event.data.object as Stripe.Checkout.Session
      const ref = session.client_reference_id

      console.log("⏰ Checkout session expired, session_id:", session.id)

      if (ref?.startsWith(DIRECTORY_ORDER_REF_PREFIX)) {
        const orderId = ref.slice(DIRECTORY_ORDER_REF_PREFIX.length)
        await db
          .update(directoryOrder)
          .set({ status: "failed", updatedAt: new Date() })
          .where(and(eq(directoryOrder.id, orderId), eq(directoryOrder.status, "pending")))
        console.log("✅ Marked directory order as failed:", orderId)
        return NextResponse.json({ success: true }, { status: 200 })
      }

      const projectId = ref

      if (projectId) {
        // Only a project genuinely awaiting payment may be failed. Stripe
        // Payment Links accept an attacker-supplied `?client_reference_id=`,
        // so without this PAYMENT_PENDING guard anyone could expire a session
        // carrying a victim's projectId and flip a SCHEDULED/LAUNCHED project
        // to PAYMENT_FAILED. Mirrors the atomic guard on the paid path and the
        // directory branch above (which already guards status="pending").
        const failResult = await db
          .update(project)
          .set({
            launchStatus: launchStatus.PAYMENT_FAILED,
            updatedAt: new Date(),
          })
          .where(
            and(eq(project.id, projectId), eq(project.launchStatus, launchStatus.PAYMENT_PENDING)),
          )
        if (failResult.rowCount && failResult.rowCount > 0) {
          console.log("✅ Updated project status to PAYMENT_FAILED:", projectId)
        } else {
          console.log("ℹ️ Expired session for non-pending project, ignored:", projectId)
        }
      }

      return NextResponse.json({ success: true }, { status: 200 })
    }

    // Pour les autres types d'événements
    console.log("ℹ️ Received event type:", event.type, "(not handled)")
    return NextResponse.json({ received: true }, { status: 200 })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    const errorStack = error instanceof Error ? error.stack : undefined
    console.error("❌ Webhook error:", errorMessage)
    if (errorStack) {
      console.error("Stack trace:", errorStack)
    }
    // 返回 500 让 Stripe 重试（这是真正的服务器错误）
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 })
  }
}

/**
 * Handles a successful Stripe checkout for a directory listing
 * order. Idempotent: re-running on the same session id (Stripe
 * retries on 5xx) is a no-op once the order is already paid.
 *
 * Status flow:
 *   pending → paid                   (Plus / Pro / Ultra: admin fulfils)
 *   pending → paid → fulfilled       (Basic: same row, both flags set)
 */
async function handleDirectoryOrderCompleted(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
  ref: string,
): Promise<NextResponse> {
  const orderId = ref.slice(DIRECTORY_ORDER_REF_PREFIX.length)

  if (session.payment_status !== "paid") {
    // Async payment methods (SEPA / bank transfer / some wallets)
    // fire `completed` with status `unpaid` and only later fire
    // `async_payment_succeeded` once the funds settle. Don't flip
    // to `failed` here — the order should stay `pending` and we'll
    // handle the eventual outcome via the async events.
    console.log(
      "ℹ️ Directory order completed but not yet paid (likely async method):",
      session.payment_status,
      orderId,
    )
    return NextResponse.json({ success: true, asyncPending: true }, { status: 200 })
  }

  // Pull the order row so we can branch on tier (Basic auto-fulfils).
  const [order] = await db
    .select()
    .from(directoryOrder)
    .where(eq(directoryOrder.id, orderId))
    .limit(1)

  if (!order) {
    console.error("⚠️ Directory order not found:", orderId)
    // Orphan — most likely the project (and its directory_order via
    // CASCADE) was deleted between createDirectoryOrder + the buyer
    // paying. Send admin alert so this $ doesn't fall into a hole.
    await handleOrphanPayment(
      stripe,
      session,
      `directory_order ${orderId} not found (deleted?)`,
      ref,
    )
    return NextResponse.json(
      { received: true, warning: "Directory order not found" },
      { status: 200 },
    )
  }

  if (!isDirectoryTier(order.tier)) {
    console.error("⚠️ Directory order has invalid tier:", order.tier, orderId)
    return NextResponse.json({ received: true, warning: "Invalid tier" }, { status: 200 })
  }

  const tier: DirectoryTier = order.tier
  const cfg = DIRECTORY_TIER_CONFIG[tier]
  const now = new Date()
  const subId =
    typeof session.subscription === "string"
      ? session.subscription
      : (session.subscription?.id ?? null)
  const customerId =
    typeof session.customer === "string" ? session.customer : (session.customer?.id ?? null)

  // Guard against a Payment Link env var pointing at the wrong Stripe
  // price: if the amount paid doesn't match the configured tier price,
  // record the payment but hold all fulfilment for admin review.
  // Promotion codes legitimately lower `amount_total` (added back inside
  // the helper); a non-numeric `amount_total` is treated as a mismatch
  // so a malformed/zero-amount session is held rather than auto-fulfilled.
  const discountCents = session.total_details?.amount_discount ?? 0
  const amountMismatch = !chargedAmountMatches(session, cfg.amountCents)
  // Fail closed: every tier is one-time now. If Stripe created a SUBSCRIPTION
  // (the Payment Link env var still points at a recurring price), the customer
  // would keep getting billed every cycle — so don't merely hold it, actively
  // UNWIND it: cancel the subscription, refund the first charge, mark the order
  // `refunded`, and alert admin to fix the link. Done before the paid flip so a
  // recurring session never lands as a "paid" order. handleOrphanPayment
  // already does the sub-cancel + first-invoice refund + admin email, all
  // idempotent (refund keyed off session.id, cancel naturally idempotent).
  if (!cfg.isSubscription && session.mode === "subscription") {
    const refundFlip = await db
      .update(directoryOrder)
      .set({
        status: "refunded",
        amountCents: session.amount_total ?? cfg.amountCents,
        currency: session.currency ?? "usd",
        stripeSessionId: session.id,
        stripeSubscriptionId: subId,
        stripeCustomerId: customerId,
        paidAt: now,
        amountVerified: false,
        updatedAt: now,
      })
      .where(and(eq(directoryOrder.id, orderId), eq(directoryOrder.status, "pending")))
    if ((refundFlip.rowCount ?? 0) === 0) {
      // Stripe retry on an already-handled order. handleOrphanPayment is
      // idempotent, but skip it to avoid a duplicate alert (its email dedups
      // too) and so we don't overwrite a terminal status set elsewhere.
      console.log("ℹ️ Subscription-mode directory order already processed, skipping:", orderId)
      return NextResponse.json({ success: true, idempotent: true }, { status: 200 })
    }
    console.error(
      `⚠️ Directory order REFUNDED — subscription-mode session for one-time tier=${tier}, order=${orderId}. Cancelling subscription + refunding first charge.`,
    )
    await handleOrphanPayment(
      stripe,
      session,
      `subscription-mode checkout for one-time directory tier ${tier} (Payment Link still recurring?) — order ${orderId}`,
      ref,
    )
    return NextResponse.json({ received: true, refunded: true }, { status: 200 })
  }

  // Past the subscription-mode guard, the only remaining hold trigger is an
  // amount mismatch: record the payment but keep all fulfilment for admin
  // review (we deliberately RETAIN the money here rather than auto-refund — a
  // mismatch can be a legitimate promo edge, so a human decides).
  const held = amountMismatch

  // Shared paid-write payload. `held` (amount OR mode mismatch) keeps the order
  // unverified → not auto-fulfilled and not syndicated until an admin clears it.
  const paidSet = {
    status: cfg.autoFulfil && !held ? "fulfilled" : "paid",
    amountCents: session.amount_total ?? cfg.amountCents,
    currency: session.currency ?? "usd",
    // Persisted so the syndicate-launches cron can email the published partner
    // URLs once delivery completes (the order is the only place we keep it).
    buyerEmail: session.customer_details?.email ?? null,
    buyerName: session.customer_details?.name ?? null,
    stripeSessionId: session.id,
    stripeSubscriptionId: subId,
    stripeCustomerId: customerId,
    paidAt: now,
    fulfilledAt: cfg.autoFulfil && !held ? now : null,
    amountVerified: !held,
    updatedAt: now,
  }

  // Atomic conditional update: only `pending` orders flip to `paid`.
  // Re-deliveries (Stripe retried after a 5xx) hit zero rows and we skip the
  // rest of the work below — keeps the operation idempotent. All tiers are
  // one-time now, so there's no slot-cap transaction — every tier takes this
  // single conditional update.
  const updateResult = await db
    .update(directoryOrder)
    .set(paidSet)
    .where(and(eq(directoryOrder.id, orderId), eq(directoryOrder.status, "pending")))
  const updateRowCount = updateResult.rowCount ?? 0

  if (updateRowCount === 0) {
    // Disambiguate idempotent (Stripe retry on already-paid order) vs
    // stale (someone canceled/refunded the order between createCheckout
    // and pay). The former is normal; the latter means money came in
    // for an order the user explicitly killed — admin needs to refund.
    const STALE_STATUSES: ReadonlyArray<string> = ["canceled", "refunded", "failed"]
    if (STALE_STATUSES.includes(order.status)) {
      console.error("⚠️ Paid webhook hit non-pending order:", orderId, "status was:", order.status)
      await handleOrphanPayment(
        stripe,
        session,
        `directory_order ${orderId} was '${order.status}' when paid webhook arrived`,
        ref,
      )
    } else if (order.stripeSessionId && order.stripeSessionId !== session.id) {
      // Already paid/fulfilled, but by a DIFFERENT checkout session — the buyer
      // paid the same order twice (two sessions off one reusable Payment Link).
      // Refund the duplicate + alert; never silently keep a second charge. (A
      // genuine Stripe retry carries the SAME session id and falls through to
      // the idempotent no-op below.)
      console.error(
        "⚠️ Duplicate payment for already-paid directory order:",
        orderId,
        "first session:",
        order.stripeSessionId,
        "duplicate:",
        session.id,
      )
      await handleOrphanPayment(
        stripe,
        session,
        `directory_order ${orderId} paid twice — duplicate session ${session.id} (first ${order.stripeSessionId})`,
        ref,
      )
    } else {
      // Genuine Stripe retry (same session id). Re-run the idempotent project
      // promotion: if the FIRST delivery flipped the order to paid but then
      // threw before scheduling (e.g. a transient DB error), Stripe's retry
      // would otherwise hit this skip branch and leave the project stranded in
      // payment_pending forever. scheduleProjectIfPendingPayment is a no-op
      // once the project is past payment_pending, so this is safe to repeat.
      await scheduleProjectIfPendingPayment(order.projectId)
      console.log("ℹ️ Directory order already processed, ensured scheduling:", orderId)
    }
    return NextResponse.json({ success: true, idempotent: true }, { status: 200 })
  }

  // If this order was paid AT submit time (project still in
  // `payment_pending`), promote the project off the queue: flip to
  // SCHEDULED and burn a premium-quota slot. This unifies the
  // submit-time paid flow into the directory_order pipeline so
  // there's no need for a separate Premium-Launch code path.
  //
  // For dashboard "Boost listing" purchases against an already-
  // launched project, `launchStatus` is no longer `payment_pending`
  // and the WHERE clause guards skip this block — schedule data
  // stays untouched.
  if (held) {
    console.error(
      `⚠️ Directory order HELD for admin review — amount mismatch: config=${cfg.amountCents}, stripe=${session.amount_total}, discount=${discountCents}. tier=${tier}, order=${orderId}`,
    )
  } else {
    await scheduleProjectIfPendingPayment(order.projectId)

    // Cross-post Plus/Pro/Ultra listings to partner sites. This only
    // ENQUEUES rows (idempotent on (order, site)); the actual HTTP push is
    // done by /api/cron/syndicate-launches with retry/backoff, so a partner
    // outage can never fail this webhook. No-op for Basic (aat.ee only).
    try {
      await enqueueLaunchSyndication(orderId, order.projectId, tier)
    } catch (err) {
      console.error("⚠️ Failed to enqueue launch syndication:", orderId, err)
    }
  }

  console.log(
    `✅ Directory order ${cfg.autoFulfil && !held ? "auto-fulfilled" : "marked paid"}:`,
    orderId,
    "tier:",
    tier,
  )

  // Send admin + buyer notifications. Both wrapped in their own
  // try/catch so a single email failure doesn't poison the other —
  // and neither bubbles up to the webhook (Stripe would retry the
  // whole event forever on a 5xx).
  const [proj] = await db
    .select({ name: project.name, websiteUrl: project.websiteUrl })
    .from(project)
    .where(eq(project.id, order.projectId))
    .limit(1)

  const userEmail = session.customer_details?.email || ""
  const userName = session.customer_details?.name ?? null
  const amount = (session.amount_total ?? cfg.amountCents) / 100
  const currency = session.currency ?? "usd"
  const projectName = proj?.name ?? "Unknown"
  const websiteUrl = proj?.websiteUrl || order.url || "https://aat.ee"

  try {
    await sendAdminPaymentNotification({
      userEmail: userEmail || "unknown@example.com",
      amount,
      currency,
      projectName: `${projectName} — Directory ${tier.toUpperCase()}${
        held ? ` — ⚠️ AMOUNT MISMATCH (expected ${cfg.amountCents}¢), fulfilment held` : ""
      }`,
      websiteUrl,
    })
    console.log("✅ Admin notification sent for directory order:", orderId)
  } catch (emailError) {
    console.error("⚠️ Failed to send admin notification for directory order:", emailError)
  }

  if (userEmail) {
    try {
      await sendBuyerDirectoryOrderConfirmation({
        buyerEmail: userEmail,
        buyerName: userName,
        tier,
        projectName,
        websiteUrl,
        amount,
        currency,
        // `order.locale` was captured at checkout creation
        // (createDirectoryOrder) — null for any pre-Phase-6 row.
        locale: order.locale ?? null,
      })
      console.log("✅ Buyer confirmation sent for directory order:", orderId)
    } catch (emailError) {
      console.error("⚠️ Failed to send buyer confirmation for directory order:", emailError)
    }
  } else {
    console.warn("⚠️ No buyer email on session; skipping buyer confirmation:", orderId)
  }

  return NextResponse.json({ success: true }, { status: 200 })
}

/**
 * If the given project is still in `payment_pending` (i.e. the
 * Directory order was created from the at-submit checkout flow),
 * promote it to SCHEDULED and burn a premium-quota slot. Mirrors
 * the existing Premium-Launch webhook scheduling logic so paid
 * Directory tiers correctly skip the free queue.
 *
 * The status guard makes this a no-op for "Boost listing"
 * purchases against already-scheduled / launched projects — those
 * paths shouldn't touch the project's launch state.
 */
async function scheduleProjectIfPendingPayment(projectId: string): Promise<void> {
  const [proj] = await db
    .select({
      id: project.id,
      slug: project.slug,
      launchStatus: project.launchStatus,
      scheduledLaunchDate: project.scheduledLaunchDate,
    })
    .from(project)
    .where(eq(project.id, projectId))
    .limit(1)

  if (!proj || proj.launchStatus !== launchStatus.PAYMENT_PENDING) return

  if (!proj.scheduledLaunchDate) {
    console.warn(
      "⚠️ Project in payment_pending has no scheduledLaunchDate; cannot promote to SCHEDULED:",
      projectId,
    )
    return
  }

  // Atomic transition — only the first writer wins, mirroring the
  // existing Premium-Launch idempotency guard.
  const updateResult = await db
    .update(project)
    .set({
      launchStatus: launchStatus.SCHEDULED,
      featuredOnHomepage: false,
      updatedAt: new Date(),
    })
    .where(and(eq(project.id, projectId), eq(project.launchStatus, launchStatus.PAYMENT_PENDING)))

  if (!updateResult.rowCount || updateResult.rowCount === 0) {
    console.log("ℹ️ Project already promoted by another writer:", projectId)
    return
  }

  // Bump the day's premium quota counter so the per-day cap stays
  // accurate. Same pattern as the existing Premium-Launch path.
  const launchDate = proj.scheduledLaunchDate
  const [existingQuota] = await db
    .select()
    .from(launchQuota)
    .where(eq(launchQuota.date, launchDate))
    .limit(1)

  if (!existingQuota) {
    await db.insert(launchQuota).values({
      id: crypto.randomUUID(),
      date: launchDate,
      freeCount: 0,
      badgeCount: 0,
      premiumCount: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  } else {
    await db
      .update(launchQuota)
      .set({
        premiumCount: sql`${launchQuota.premiumCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(launchQuota.id, existingQuota.id))
  }

  revalidatePath("/projects")
  revalidatePath("/sitemap.xml")
  try {
    revalidatePath(`/projects/${proj.slug}`)
  } catch (err) {
    console.error("⚠️ Error revalidating slug path:", err)
  }
  console.log("✅ Project scheduled via directory_order at-submit path:", projectId)
}
