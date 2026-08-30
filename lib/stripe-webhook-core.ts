import type Stripe from "stripe"

import { DIRECTORY_ORDER_REF_PREFIX } from "@/lib/directory-tiers"

const EXPECTED_CURRENCY = "usd"
const CANONICAL_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DEAD_SUBSCRIPTION_STATUSES: ReadonlySet<Stripe.Subscription.Status> = new Set([
  "incomplete_expired",
  "unpaid",
  "canceled",
])

const STALE_DIRECTORY_ORDER_STATUSES: ReadonlySet<string> = new Set([
  "canceled",
  "refunded",
  "failed",
])

export type DirectoryOrderReplayDecision =
  "refunded_replay" | "stale_order" | "duplicate_payment" | "repair_hold" | "held" | "replay"

interface DirectoryOrderReplayInput {
  status: string
  storedSessionId: string | null
  incomingSessionId: string
  amountVerified: boolean
  amountMismatch: boolean
}

/**
 * Validate the configured catalogue price, not the tax-inclusive amount that
 * happened to be charged to this buyer.
 *
 * Stripe defines `amount_subtotal` as the line-item total before discounts and
 * taxes, which is exactly the value our tier configuration captures. Prefer it
 * when present. The fallback preserves compatibility with older/synthetic
 * Checkout payloads by removing tax and shipping and adding discounts back.
 */
export function chargedAmountMatches(
  session: Stripe.Checkout.Session,
  expectedCents: number,
): boolean {
  if (session.currency !== EXPECTED_CURRENCY) return false
  if (typeof session.amount_subtotal === "number") {
    return session.amount_subtotal === expectedCents
  }
  if (typeof session.amount_total !== "number") return false
  const discountCents = session.total_details?.amount_discount ?? 0
  const taxCents = session.total_details?.amount_tax ?? 0
  const shippingCents = session.total_details?.amount_shipping ?? 0
  return session.amount_total + discountCents - taxCents - shippingCents === expectedCents
}

export function directoryOrderIdFromReference(reference: string | null): string | null {
  if (!reference?.startsWith(DIRECTORY_ORDER_REF_PREFIX)) return null
  const orderId = reference.slice(DIRECTORY_ORDER_REF_PREFIX.length)
  return CANONICAL_UUID_PATTERN.test(orderId) ? orderId : null
}

export function isDeadSubscriptionStatus(status: Stripe.Subscription.Status): boolean {
  return DEAD_SUBSCRIPTION_STATUSES.has(status)
}

/**
 * Classify a failed `pending -> paid` conditional update using the row that
 * won the race. The caller remains responsible for effects; keeping this
 * function pure makes the money-sensitive precedence explicit and testable.
 */
export function classifyDirectoryOrderReplay({
  status,
  storedSessionId,
  incomingSessionId,
  amountVerified,
  amountMismatch,
}: DirectoryOrderReplayInput): DirectoryOrderReplayDecision {
  if (status === "refunded" && storedSessionId === incomingSessionId) {
    return "refunded_replay"
  }
  if (STALE_DIRECTORY_ORDER_STATUSES.has(status)) return "stale_order"
  if (storedSessionId && storedSessionId !== incomingSessionId) return "duplicate_payment"
  if (!amountVerified) {
    if (!amountMismatch && status === "paid" && storedSessionId === incomingSessionId) {
      return "repair_hold"
    }
    return "held"
  }
  return "replay"
}
