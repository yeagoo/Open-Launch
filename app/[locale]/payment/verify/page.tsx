import { redirect } from "next/navigation"

import { db } from "@/drizzle/db"
import { directoryOrder } from "@/drizzle/db/schema"
import { eq } from "drizzle-orm"

import { DIRECTORY_ORDER_REF_PREFIX } from "@/lib/directory-tiers"
import { createStripeClient } from "@/lib/stripe"
import { directoryOrderIdFromReference } from "@/lib/stripe-webhook-core"

export const dynamic = "force-dynamic"

/**
 * Stripe Payment Link `after_completion` lands the buyer here. We
 * dispatch to the right post-payment surface based on which flow
 * the session came from:
 *
 *  - Directory orders (Basic / Plus / Pro / Ultra) carry a
 *    `dir_<orderId>` `client_reference_id`. The webhook has already
 *    flipped the row to `paid` (and for auto-fulfil tiers,
 *    `fulfilled`), so we send the buyer to their dashboard where
 *    they can see the listing and — for Ultra — manage the
 *    subscription. A `dir_order=success` flag lets the dashboard
 *    surface an inline confirmation.
 *
 *  - Premium-launch flow uses a bare `<projectId>` ref. The
 *    existing `/payment/success` page already does the fast-path
 *    PAYMENT_PENDING → SCHEDULED transition + project-page
 *    redirect, so we just forward the session id over.
 *
 * Before this route existed, Stripe's redirect URL landed on a 404.
 */
export default async function PaymentVerifyPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ session_id?: string }>
}) {
  const { locale } = await params
  const sp = await searchParams
  const sessionId = sp.session_id

  // No session id: the user typed the URL or came from a stale tab.
  // Send them somewhere useful instead of a "missing param" error.
  if (!sessionId) {
    redirect(`/${locale}/dashboard`)
  }

  const stripe = createStripeClient()
  if (!stripe) {
    console.error("[payment-verify] STRIPE_SECRET_KEY is not configured")
    redirect(`/${locale}/dashboard`)
  }

  let ref: string | null = null
  let paymentStatus: string | null = null
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId)
    ref = session.client_reference_id ?? null
    paymentStatus = session.payment_status
  } catch (err) {
    // Stripe was unreachable or the session id was bogus. The
    // webhook is the source of truth, so the safest fallback is to
    // route the user to their dashboard where they can see their
    // actual state (the listing or the project).
    console.error("[payment-verify] Stripe session lookup failed:", err)
    redirect(`/${locale}/dashboard`)
  }

  if (ref?.startsWith(DIRECTORY_ORDER_REF_PREFIX)) {
    const orderId = directoryOrderIdFromReference(ref)
    if (!orderId || paymentStatus !== "paid") {
      redirect(`/${locale}/dashboard?dir_order=processing`)
    }

    const [order] = await db
      .select({
        status: directoryOrder.status,
        amountVerified: directoryOrder.amountVerified,
        stripeSessionId: directoryOrder.stripeSessionId,
      })
      .from(directoryOrder)
      .where(eq(directoryOrder.id, orderId))
      .limit(1)

    if (order?.status === "refunded") {
      redirect(`/${locale}/dashboard?dir_order=refunded`)
    }
    if (
      (order?.status === "paid" || order?.status === "fulfilled") &&
      order.amountVerified &&
      order.stripeSessionId === sessionId
    ) {
      redirect(`/${locale}/dashboard?dir_order=success`)
    }
    if (order?.status === "paid" && !order.amountVerified) {
      redirect(`/${locale}/dashboard?dir_order=review`)
    }
    redirect(`/${locale}/dashboard?dir_order=processing`)
  }

  // Premium-launch (bare project id) or unknown — forward to the
  // existing /payment/success client page which handles the fast-
  // path verify call and renders the success UI.
  redirect(`/${locale}/payment/success?session_id=${encodeURIComponent(sessionId)}`)
}
