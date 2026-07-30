import { revalidatePath } from "next/cache"
import { NextResponse } from "next/server"

import { db } from "@/drizzle/db"
import { directoryOrder, launchStatus, launchSyndication, project } from "@/drizzle/db/schema"
import { and, eq, inArray } from "drizzle-orm"
import type Stripe from "stripe"

import { LAUNCH_SETTINGS } from "@/lib/constants"
import {
  DIRECTORY_ORDER_REF_PREFIX,
  DIRECTORY_TIER_CONFIG,
  isDirectoryTier,
  type DirectoryTier,
} from "@/lib/directory-tiers"
import {
  enqueueEmail,
  type DirectoryOrderConfirmationPayload,
  type PaymentAdminPayload,
} from "@/lib/email-outbox"
import { enqueueLaunchSyndication } from "@/lib/launch-syndication"
import { logger } from "@/lib/observability/structured-logger"
import {
  confirmPaidPremiumLaunch,
  type PremiumLaunchConfirmationResult,
} from "@/lib/premium-launch-confirmation"
import { notifyDiscordForScheduledProject } from "@/lib/project-launch-notification"
import { dedupeOnce } from "@/lib/rate-limit"
import { readRequestTextBounded, RequestBodyTooLargeError } from "@/lib/read-request-body"
import { createStripeClient } from "@/lib/stripe"
import {
  chargedAmountMatches,
  directoryOrderIdFromReference,
  isDeadSubscriptionStatus,
} from "@/lib/stripe-webhook-core"
import {
  sendAdminPaymentNotification,
  sendBuyerDirectoryOrderConfirmation,
} from "@/lib/transactional-emails"

// Expected charge for a legacy Premium Launch, in cents.
const PREMIUM_PRICE_CENTS = Math.round(LAUNCH_SETTINGS.PREMIUM_PRICE * 100)

const MAX_STRIPE_WEBHOOK_BYTES = 1024 * 1024
const STRIPE_WEBHOOK_ROUTE = "/api/auth/stripe/webhook"

function stripeDiagnostic(level: "info" | "warn" | "error", ...details: unknown[]): void {
  const error = details.find((detail) => detail instanceof Error)
  logger[level]("stripe_webhook_diagnostic", {
    route: STRIPE_WEBHOOK_ROUTE,
    status: level,
    provider: "stripe",
    context: {
      details: details.filter((detail) => !(detail instanceof Error)),
    },
    error,
  })
}

function paymentEmailOutboxEnabled(): boolean {
  return process.env.PAYMENT_EMAIL_OUTBOX_ENABLED === "true"
}

async function deliverPaymentAdminEmail(
  eventKey: string,
  payload: PaymentAdminPayload,
): Promise<void> {
  if (paymentEmailOutboxEnabled()) {
    await enqueueEmail("payment_admin", eventKey, payload)
    return
  }

  try {
    await sendAdminPaymentNotification(payload)
  } catch (error) {
    // Preserve the pre-Phase-8 best-effort behavior during the consumer-only
    // rollout. Outbox mode deliberately lets enqueue failures reach Stripe.
    stripeDiagnostic("error", "Failed to send inline admin payment notification", error)
  }
}

async function deliverDirectoryBuyerEmail(
  eventKey: string,
  payload: DirectoryOrderConfirmationPayload,
): Promise<void> {
  if (paymentEmailOutboxEnabled()) {
    await enqueueEmail("directory_order_confirmation", eventKey, payload)
    return
  }

  try {
    await sendBuyerDirectoryOrderConfirmation(payload)
  } catch (error) {
    stripeDiagnostic("error", "Failed to send inline directory buyer confirmation", error)
  }
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
    stripeDiagnostic(
      "info",
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
  stripeDiagnostic("info", "Subscription dead, marked order canceled", stripeSubscriptionId, reason)
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
  let amountCents = session.amount_total
  let currency = session.currency ?? "usd"

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
      if (typeof refund.amount === "number") amountCents = refund.amount
      if (refund.currency) currency = refund.currency
      const refundLabel = `refund ${refund.id} for $${(amountCents ?? 0) / 100} ${currency.toUpperCase()}`
      refundOutcome = refundOutcome ? `${refundOutcome} + ${refundLabel}` : refundLabel
    } else if (!refundOutcome) {
      refundOutcome = "no payment_intent resolvable — cannot refund automatically"
    }
  } catch (err) {
    refundOutcome = `AUTO-REFUND FAILED: ${err instanceof Error ? err.message : String(err)} — manual refund required`
    stripeDiagnostic("error", "Orphan auto-refund failed", err)
  }

  // Email admin — paper trail of every orphan + which root cause
  // (none-ref / project-gone / order-gone) hit production. Suppress
  // duplicate emails when the same session.id hits within the dedup
  // window (typical when admin manually resends a webhook batch).
  if (!(await shouldEmailOrphan(session.id))) {
    stripeDiagnostic("info", "Suppressed duplicate orphan alert email", session.id)
    return
  }
  try {
    await sendAdminPaymentNotification({
      userEmail,
      amount: (amountCents ?? 0) / 100,
      currency,
      projectName: `${reason} — ${refundOutcome}`,
      websiteUrl: `Stripe session: ${session.id} | client_reference_id: ${ref ?? "(none)"}`,
      orphan: true,
    })
  } catch (err) {
    stripeDiagnostic("error", "Failed to send orphan-payment alert email", err)
  }
}

/**
 * Shared completion path for immediate and delayed Premium payments.
 *
 * Domain mutation remains guarded by confirmPaidPremiumLaunch. The durable
 * admin email is enqueued for every successful logical payment, including an
 * already-processed replay, so a crash after the project update but before the
 * enqueue is repaired by Stripe's retry. The session-scoped event key absorbs
 * checkout.completed + async_payment_succeeded overlap and provider retries.
 */
async function handlePremiumPaymentSucceeded(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
  projectId: string,
  includeConfirmationStatus: boolean,
): Promise<NextResponse> {
  if (session.payment_status !== "paid") {
    stripeDiagnostic("warn", "Paid-payment handler received an unpaid session", session.id)
    return NextResponse.json({ success: true, pending: true }, { status: 200 })
  }

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
    .limit(1)

  if (!projectData) {
    stripeDiagnostic("warn", "Project not found", projectId)
    await handleOrphanPayment(stripe, session, `project ${projectId} not found`, projectId)
    return NextResponse.json({ received: true, warning: "Project not found" }, { status: 200 })
  }

  if (!projectData.scheduledLaunchDate) {
    stripeDiagnostic("warn", "Project data incomplete", projectId)
    await handleOrphanPayment(
      stripe,
      session,
      `project ${projectId} has no scheduled launch date`,
      projectId,
    )
    return NextResponse.json(
      { received: true, warning: "Project data incomplete — payment refunded" },
      { status: 200 },
    )
  }

  stripeDiagnostic("info", "Project found and scheduled", projectData.scheduledLaunchDate)

  // client_reference_id is browser-controlled. Validate the captured amount
  // before the first state transition; a replay is allowed through so it can
  // repair durable post-processing without refunding the legitimate payment.
  const expectedPremiumCents = projectData.premiumPriceCents ?? PREMIUM_PRICE_CENTS
  if (
    projectData.launchStatus === launchStatus.PAYMENT_PENDING &&
    !chargedAmountMatches(session, expectedPremiumCents)
  ) {
    stripeDiagnostic(
      "warn",
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

  const confirmation = await confirmPaidPremiumLaunch(projectId)
  if (confirmation.status === "rejected") {
    await handleOrphanPayment(
      stripe,
      session,
      `premium launch confirmation rejected (${confirmation.reason}) for project ${projectId}`,
      projectId,
    )
    return NextResponse.json(
      { received: true, warning: `${confirmation.reason} — payment refunded` },
      { status: 200 },
    )
  }

  if (confirmation.status === "already_processed") {
    stripeDiagnostic("info", "Project already processed, ensuring durable payment notification")
  } else {
    stripeDiagnostic("info", "Payment confirmed for project", projectId)
    try {
      await notifyDiscordForScheduledProject(projectId)
    } catch (notificationError) {
      stripeDiagnostic(
        "error",
        "Failed to send paid-launch Discord notification",
        notificationError,
      )
    }
  }

  // Cache invalidation is idempotent and belongs on the replay path too: the
  // first delivery may commit the project and stop before reaching this point.
  revalidatePath("/sitemap.xml")
  try {
    revalidatePath("/projects")
    revalidatePath(`/projects/${confirmation.slug}`)
    stripeDiagnostic("info", "Revalidated project paths", projectId)
  } catch (revalidateError) {
    stripeDiagnostic("error", "Error revalidating paths", revalidateError)
  }

  // Once the staged flag is enabled, do not catch this database write.
  // Returning 500 makes Stripe retry, and the already_processed branch above
  // safely repairs a missed enqueue.
  await deliverPaymentAdminEmail(`stripe:premium:${session.id}:admin`, {
    userEmail: session.customer_details?.email || "unknown@example.com",
    amount: (session.amount_total || 0) / 100,
    currency: session.currency || "usd",
    projectName: projectData.name || "Unknown Project",
    websiteUrl: projectData.websiteUrl || "https://aat.ee",
  })

  stripeDiagnostic("info", "Webhook processed successfully for project", projectId)
  const responseBody = includeConfirmationStatus
    ? { success: true, confirmation: confirmation.status }
    : { success: true }
  return NextResponse.json(responseBody, { status: 200 })
}

async function handleStripeWebhook(request: Request) {
  try {
    // 检查环境变量是否配置
    const stripe = createStripeClient()
    if (!stripe) {
      stripeDiagnostic("error", "STRIPE_SECRET_KEY is not configured")
      return NextResponse.json({ error: "Stripe configuration error" }, { status: 500 })
    }

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
    if (!webhookSecret) {
      stripeDiagnostic("error", "STRIPE_WEBHOOK_SECRET is not configured")
      return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 })
    }

    let body: string
    try {
      body = await readRequestTextBounded(request, MAX_STRIPE_WEBHOOK_BYTES)
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof RequestBodyTooLargeError ? "Payload too large" : "Invalid body" },
        { status: error instanceof RequestBodyTooLargeError ? 413 : 400 },
      )
    }
    const signature = request.headers.get("stripe-signature") as string

    if (!signature) {
      stripeDiagnostic("warn", "No stripe-signature header found")
      return NextResponse.json({ error: "No signature header" }, { status: 400 })
    }

    // Vérifier la signature du webhook
    let event: Stripe.Event
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
      stripeDiagnostic("info", "Webhook signature verified", event.type)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error"
      stripeDiagnostic("warn", "Webhook signature verification failed", errorMessage)
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
        stripeDiagnostic("warn", "No project ID found in session metadata", session.id)
        // 返回 200 避免 Stripe 重试，但发管理员告警
        await handleOrphanPayment(stripe, session, "no client_reference_id", null)
        return NextResponse.json({ received: true, warning: "No project ID" }, { status: 200 })
      }

      stripeDiagnostic("info", "Processing payment for project", projectId)

      if (session.payment_status === "paid") {
        return await handlePremiumPaymentSucceeded(stripe, session, projectId, false)
      } else {
        // Payment Links expose client_reference_id to the browser. An unpaid
        // or no-payment-required session therefore has no authority to mutate
        // a project. Leave it pending; the normal stale-payment cleanup owns
        // expiry and a later async_payment_succeeded event owns confirmation.
        stripeDiagnostic(
          "info",
          "Payment not completed; project left unchanged",
          session.payment_status,
        )
        return NextResponse.json({ success: true, pending: true }, { status: 200 })
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
      if (!ref) return NextResponse.json({ received: true }, { status: 200 })
      return await handlePremiumPaymentSucceeded(stripe, session, ref, true)
    } else if (event.type === "checkout.session.async_payment_failed") {
      const session = event.data.object as Stripe.Checkout.Session
      const ref = session.client_reference_id
      const failedOrderId = directoryOrderIdFromReference(ref)
      if (failedOrderId) {
        await db
          .update(directoryOrder)
          .set({ status: "failed", updatedAt: new Date() })
          .where(and(eq(directoryOrder.id, failedOrderId), eq(directoryOrder.status, "pending")))
        stripeDiagnostic("info", "Marked directory order as failed (async)", failedOrderId)
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
      if (!isDeadSubscriptionStatus(sub.status)) {
        return NextResponse.json({ success: true, noop: true }, { status: 200 })
      }
      await markUltraOrderCanceled(sub.id, `updated[${sub.status}]`)
      return NextResponse.json({ success: true }, { status: 200 })
    } else if (event.type === "checkout.session.expired") {
      const session = event.data.object as Stripe.Checkout.Session
      const ref = session.client_reference_id

      stripeDiagnostic("info", "Checkout session expired", session.id)

      const expiredOrderId = directoryOrderIdFromReference(ref)
      if (expiredOrderId) {
        await db
          .update(directoryOrder)
          .set({ status: "failed", updatedAt: new Date() })
          .where(and(eq(directoryOrder.id, expiredOrderId), eq(directoryOrder.status, "pending")))
        stripeDiagnostic("info", "Marked directory order as failed", expiredOrderId)
        return NextResponse.json({ success: true }, { status: 200 })
      }

      // A bare project reference came from a browser-visible Payment Link and
      // is not an authorization capability. Do not mutate the project from an
      // expiry event; the authenticated stale-payment cleanup owns expiry.
      if (ref) stripeDiagnostic("info", "Expired premium session left project unchanged", ref)

      return NextResponse.json({ success: true }, { status: 200 })
    }

    // Pour les autres types d'événements
    stripeDiagnostic("info", "Received unhandled event type", event.type)
    return NextResponse.json({ received: true }, { status: 200 })
  } catch (error) {
    stripeDiagnostic("error", "Webhook error", error)
    // 返回 500 让 Stripe 重试（这是真正的服务器错误）
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 })
  }
}

export async function handleStripeWebhookPost(request: Request) {
  const startedAt = Date.now()
  const requestId = request.headers.get("x-aat-request-id")
  try {
    const response = await handleStripeWebhook(request)
    const fields = {
      requestId,
      route: STRIPE_WEBHOOK_ROUTE,
      status: response.status,
      durationMs: Date.now() - startedAt,
      provider: "stripe",
    }
    if (response.status >= 400) logger.warn("stripe_webhook_completed", fields)
    else logger.info("stripe_webhook_completed", fields)
    return response
  } catch (error) {
    logger.error("stripe_webhook_failed", {
      requestId,
      route: STRIPE_WEBHOOK_ROUTE,
      status: 500,
      durationMs: Date.now() - startedAt,
      provider: "stripe",
      error,
    })
    throw error
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
  const orderId = directoryOrderIdFromReference(ref)
  if (!orderId) {
    stripeDiagnostic("warn", "Directory order reference is malformed", ref)
    await handleOrphanPayment(stripe, session, "invalid directory_order reference", ref)
    return NextResponse.json(
      { received: true, warning: "Invalid directory order reference" },
      { status: 200 },
    )
  }

  if (session.payment_status !== "paid") {
    // Async payment methods (SEPA / bank transfer / some wallets)
    // fire `completed` with status `unpaid` and only later fire
    // `async_payment_succeeded` once the funds settle. Don't flip
    // to `failed` here — the order should stay `pending` and we'll
    // handle the eventual outcome via the async events.
    stripeDiagnostic(
      "info",
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
    stripeDiagnostic("warn", "Directory order not found", orderId)
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
    stripeDiagnostic("error", "Directory order has invalid tier", order.tier, orderId)
    return NextResponse.json({ received: true, warning: "Invalid tier" }, { status: 200 })
  }

  // The project was deleted after the order was created (project_id is
  // SET NULL instead of CASCADE since 0048, so the order row survives).
  // An already paid/fulfilled order means this is just a Stripe retry
  // arriving after deletion — the purchase was legitimately fulfilled,
  // so it must no-op, never refund. Every other status (pending: paid
  // after deletion; canceled/refunded/failed: the user killed the order
  // but the still-open Payment Link completed) is money with nowhere to
  // go → orphan refund + alert.
  if (!order.projectId) {
    if (order.status === "paid" || order.status === "fulfilled") {
      // Same-session Stripe retry after deletion → genuine no-op. A
      // DIFFERENT session id means the buyer paid the same order twice
      // (reusable Payment Link) — that second charge must be refunded,
      // same as the duplicate-payment branch for live projects below.
      if (order.stripeSessionId && order.stripeSessionId !== session.id) {
        await handleOrphanPayment(
          stripe,
          session,
          `directory_order ${orderId} paid twice (project deleted) — duplicate session ${session.id} (first ${order.stripeSessionId})`,
          ref,
        )
        return NextResponse.json({ received: true, warning: "Duplicate payment" }, { status: 200 })
      }
      stripeDiagnostic("info", "Directory order already processed; project since deleted", orderId)
      return NextResponse.json({ success: true, idempotent: true }, { status: 200 })
    }
    await handleOrphanPayment(
      stripe,
      session,
      `directory_order ${orderId} (status=${order.status}) paid but project was deleted`,
      ref,
    )
    return NextResponse.json({ received: true, warning: "Order project deleted" }, { status: 200 })
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
      stripeDiagnostic(
        "info",
        "Subscription-mode directory order already processed, skipping",
        orderId,
      )
      return NextResponse.json({ success: true, idempotent: true }, { status: 200 })
    }
    stripeDiagnostic(
      "error",
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
    // Re-read after the failed conditional update. The snapshot loaded above
    // may still say `pending` when two different Checkout Sessions complete
    // concurrently; decisions must use the row written by the winner.
    const [currentOrder] = await db
      .select({
        status: directoryOrder.status,
        stripeSessionId: directoryOrder.stripeSessionId,
        amountVerified: directoryOrder.amountVerified,
      })
      .from(directoryOrder)
      .where(eq(directoryOrder.id, orderId))
      .limit(1)
    if (!currentOrder) {
      await handleOrphanPayment(
        stripe,
        session,
        `directory_order ${orderId} disappeared while processing payment`,
        ref,
      )
      return NextResponse.json({ received: true, warning: "Directory order disappeared" })
    }

    // Disambiguate idempotent (Stripe retry on already-paid order) vs
    // stale (someone canceled/refunded the order between createCheckout
    // and pay). The former is normal; the latter means money came in
    // for an order the user explicitly killed — admin needs to refund.
    const STALE_STATUSES: ReadonlyArray<string> = ["canceled", "refunded", "failed"]
    if (STALE_STATUSES.includes(currentOrder.status)) {
      stripeDiagnostic(
        "warn",
        "⚠️ Paid webhook hit non-pending order:",
        orderId,
        "status was:",
        currentOrder.status,
      )
      await handleOrphanPayment(
        stripe,
        session,
        `directory_order ${orderId} was '${currentOrder.status}' when paid webhook arrived`,
        ref,
      )
    } else if (currentOrder.stripeSessionId && currentOrder.stripeSessionId !== session.id) {
      // Already paid/fulfilled, but by a DIFFERENT checkout session — the buyer
      // paid the same order twice (two sessions off one reusable Payment Link).
      // Refund the duplicate + alert; never silently keep a second charge. (A
      // genuine Stripe retry carries the SAME session id and falls through to
      // the idempotent no-op below.)
      stripeDiagnostic(
        "warn",
        "⚠️ Duplicate payment for already-paid directory order:",
        orderId,
        "first session:",
        currentOrder.stripeSessionId,
        "duplicate:",
        session.id,
      )
      await handleOrphanPayment(
        stripe,
        session,
        `directory_order ${orderId} paid twice — duplicate session ${session.id} (first ${currentOrder.stripeSessionId})`,
        ref,
      )
    } else if (!currentOrder.amountVerified) {
      // Amount-mismatch orders are deliberately held for admin review. A
      // webhook retry must not bypass that hold and schedule the project.
      stripeDiagnostic("info", "Directory order remains held; scheduling skipped", orderId)
      const terminalResponse = await finishDirectoryOrderPayment({
        stripe,
        session,
        orderId,
        order,
        projectId: order.projectId,
        tier,
        held: true,
      })
      if (terminalResponse) return terminalResponse
    } else {
      // Genuine Stripe retry (same session id). Re-run the idempotent project
      // promotion, syndication enqueue, cache invalidation and durable emails.
      // Each operation is idempotent, so a crash at any boundary is repaired.
      const terminalResponse = await finishDirectoryOrderPayment({
        stripe,
        session,
        orderId,
        order,
        projectId: order.projectId,
        tier,
        held: false,
      })
      if (terminalResponse) return terminalResponse
      stripeDiagnostic(
        "info",
        "Directory order already processed, ensured post-processing",
        orderId,
      )
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
  if (held)
    stripeDiagnostic(
      "warn",
      `⚠️ Directory order HELD for admin review — amount mismatch: config=${cfg.amountCents}, stripe=${session.amount_total}, discount=${discountCents}. tier=${tier}, order=${orderId}`,
    )

  const terminalResponse = await finishDirectoryOrderPayment({
    stripe,
    session,
    orderId,
    order,
    projectId: order.projectId,
    tier,
    held,
  })
  if (terminalResponse) return terminalResponse

  stripeDiagnostic(
    "info",
    "✅ Directory order status:",
    cfg.autoFulfil && !held ? "auto-fulfilled" : "marked paid",
    orderId,
    "tier:",
    tier,
  )

  return NextResponse.json({ success: true }, { status: 200 })
}

async function finishDirectoryOrderPayment({
  stripe,
  session,
  orderId,
  order,
  projectId,
  tier,
  held,
}: {
  stripe: Stripe
  session: Stripe.Checkout.Session
  orderId: string
  order: typeof directoryOrder.$inferSelect
  projectId: string
  tier: DirectoryTier
  held: boolean
}): Promise<NextResponse | null> {
  if (!held) {
    const confirmation = await scheduleProjectIfPendingPayment(projectId)
    if (confirmation.status === "rejected") {
      return refundDirectoryOrderAfterLaunchRejection(
        stripe,
        session,
        orderId,
        `${DIRECTORY_ORDER_REF_PREFIX}${orderId}`,
        projectId,
        confirmation.reason,
      )
    }

    // This is a database enqueue with a unique (order, site) key. Let failures
    // return 500 so Stripe retries and the idempotent replay repairs the queue.
    await enqueueLaunchSyndication(orderId, projectId, tier)
  }

  const [projectData] = await db
    .select({ name: project.name, websiteUrl: project.websiteUrl })
    .from(project)
    .where(eq(project.id, projectId))
    .limit(1)

  const config = DIRECTORY_TIER_CONFIG[tier]
  const userEmail = session.customer_details?.email || order.buyerEmail || ""
  const userName = session.customer_details?.name ?? order.buyerName ?? null
  const amount = (session.amount_total ?? order.amountCents ?? config.amountCents) / 100
  const currency = session.currency ?? order.currency ?? "usd"
  const projectName = projectData?.name ?? "Unknown"
  const websiteUrl = projectData?.websiteUrl || order.url || "https://aat.ee"

  // In outbox mode these inserts are intentionally not best-effort. If the
  // process dies after the paid flip, Stripe retries and the same-session branch
  // reruns this function. Stable event keys absorb replay and event overlap.
  await deliverPaymentAdminEmail(`stripe:directory:${session.id}:admin`, {
    userEmail: userEmail || "unknown@example.com",
    amount,
    currency,
    projectName: `${projectName} — Directory ${tier.toUpperCase()}${
      held ? ` — ⚠️ AMOUNT MISMATCH (expected ${config.amountCents}¢), fulfilment held` : ""
    }`,
    websiteUrl,
  })

  if (userEmail) {
    await deliverDirectoryBuyerEmail(`stripe:directory:${session.id}:buyer`, {
      buyerEmail: userEmail,
      buyerName: userName,
      tier,
      projectName,
      websiteUrl,
      amount,
      currency,
      locale: order.locale ?? null,
    })
  } else {
    stripeDiagnostic("warn", "No buyer email on session; skipping buyer confirmation", orderId)
  }

  return null
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
async function scheduleProjectIfPendingPayment(
  projectId: string,
): Promise<PremiumLaunchConfirmationResult> {
  const confirmation = await confirmPaidPremiumLaunch(projectId, {
    allowNonPremiumProcessed: true,
  })
  if (confirmation.status === "rejected") {
    stripeDiagnostic(
      "warn",
      "⚠️ Directory payment could not schedule project:",
      projectId,
      confirmation.reason,
    )
    return confirmation
  }

  // Revalidation is safe to repeat and must also run on an idempotent replay:
  // the first delivery may have committed the project state and then crashed
  // before invalidating caches.
  revalidatePath("/projects")
  revalidatePath("/sitemap.xml")
  try {
    revalidatePath(`/projects/${confirmation.slug}`)
  } catch (err) {
    stripeDiagnostic("error", "Error revalidating slug path", err)
  }
  if (confirmation.status === "scheduled") {
    stripeDiagnostic("info", "Project scheduled via directory_order at-submit path", projectId)
    try {
      await notifyDiscordForScheduledProject(projectId)
    } catch (notificationError) {
      stripeDiagnostic(
        "error",
        "Failed to send directory-launch Discord notification",
        notificationError,
      )
    }
  }
  return confirmation
}

async function refundDirectoryOrderAfterLaunchRejection(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
  orderId: string,
  ref: string,
  projectId: string,
  reason: string,
): Promise<NextResponse> {
  await db
    .update(directoryOrder)
    .set({ status: "refunded", amountVerified: false, updatedAt: new Date() })
    .where(
      and(
        eq(directoryOrder.id, orderId),
        eq(directoryOrder.stripeSessionId, session.id),
        inArray(directoryOrder.status, ["paid", "fulfilled"]),
      ),
    )

  await handleOrphanPayment(
    stripe,
    session,
    `directory payment could not schedule project ${projectId} (${reason})`,
    ref,
  )
  return NextResponse.json(
    { received: true, refunded: true, warning: `Launch confirmation rejected: ${reason}` },
    { status: 200 },
  )
}
