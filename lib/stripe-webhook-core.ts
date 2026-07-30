import type Stripe from "stripe"

import { DIRECTORY_ORDER_REF_PREFIX } from "@/lib/directory-tiers"

const EXPECTED_CURRENCY = "usd"
const CANONICAL_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DEAD_SUBSCRIPTION_STATUSES: ReadonlySet<Stripe.Subscription.Status> = new Set([
  "incomplete_expired",
  "unpaid",
  "canceled",
])

/**
 * Promotion codes legitimately lower amount_total, so add the Stripe-reported
 * discount back before comparing with the price captured by the application.
 */
export function chargedAmountMatches(
  session: Stripe.Checkout.Session,
  expectedCents: number,
): boolean {
  if (session.currency !== EXPECTED_CURRENCY) return false
  if (typeof session.amount_total !== "number") return false
  const discountCents = session.total_details?.amount_discount ?? 0
  return session.amount_total + discountCents === expectedCents
}

export function directoryOrderIdFromReference(reference: string | null): string | null {
  if (!reference?.startsWith(DIRECTORY_ORDER_REF_PREFIX)) return null
  const orderId = reference.slice(DIRECTORY_ORDER_REF_PREFIX.length)
  return CANONICAL_UUID_PATTERN.test(orderId) ? orderId : null
}

export function isDeadSubscriptionStatus(status: Stripe.Subscription.Status): boolean {
  return DEAD_SUBSCRIPTION_STATUSES.has(status)
}
