/**
 * Directory tier configuration.
 *
 * Aligns with the existing premium-launch flow which uses a Stripe
 * Payment Link (not a programmatically created Checkout Session) —
 * each tier has one Stripe Payment Link configured in the dashboard,
 * its URL parked in an env var. Per-purchase data (which project,
 * which order) is threaded via `?client_reference_id=dir_<orderId>`.
 *
 * Pricing copy on the marketing page lives in i18n messages, NOT in
 * this file — keep the two in sync when prices change.
 */

export const DIRECTORY_TIERS = ["basic", "plus", "pro", "ultra"] as const
export type DirectoryTier = (typeof DIRECTORY_TIERS)[number]

export const DIRECTORY_ORDER_STATUSES = [
  "pending",
  "paid",
  "fulfilled",
  "refunded",
  "failed",
  "canceled", // Ultra subscription canceled by customer/admin
] as const
export type DirectoryOrderStatus = (typeof DIRECTORY_ORDER_STATUSES)[number]

// Prefix for directory-order references. The premium-launch webhook
// uses bare project IDs as `client_reference_id`, so we prefix
// directory-order ids to disambiguate at webhook dispatch time.
export const DIRECTORY_ORDER_REF_PREFIX = "dir_"

// How many concurrent Ultra sponsorships we allow. The marketing
// page promises "Limited to 5 active sponsors at any time" — this
// constant is the single source of truth for that cap (checkout
// gate, UI hint text, sidebar render limit).
export const ULTRA_SPONSOR_SLOT_LIMIT = 5

// Test-phase promo code displayed on /pricing/directories. The
// actual discount is configured server-side in the Stripe Dashboard
// (Coupons + Promotion Codes) — this is just the marketing surface.
// Flip `enabled: false` to retire the banner without redeploying
// code (well, the env-config edit still needs a build, but you
// don't have to touch the page itself).
export const DIRECTORY_PROMO = {
  enabled: true,
  code: "AAT15",
} as const

interface TierConfig {
  // Env var holding the full Stripe Payment Link URL. Read at
  // request time so a missing config fails loudly only when someone
  // tries to checkout, not on app boot.
  paymentLinkEnvVar: string
  // USD cents matching the marketing copy. The webhook logs a
  // warning when `session.amount_total` differs (likely env var
  // pointing at the wrong Stripe Payment Link), and uses Stripe's
  // value as the truth for the row.
  amountCents: number
  // Subscriptions show different copy + fulfilment + lifecycle.
  isSubscription: boolean
  // Basic auto-fulfils because the only target site is aat.ee (we
  // own the dataset). Plus / Pro / Ultra span partner sites that
  // require a human to place the listing.
  autoFulfil: boolean
}

export const DIRECTORY_TIER_CONFIG: Record<DirectoryTier, TierConfig> = {
  basic: {
    paymentLinkEnvVar: "NEXT_PUBLIC_DIRECTORY_PAYMENT_LINK_BASIC",
    amountCents: 399,
    isSubscription: false,
    autoFulfil: true,
  },
  plus: {
    paymentLinkEnvVar: "NEXT_PUBLIC_DIRECTORY_PAYMENT_LINK_PLUS",
    amountCents: 699,
    isSubscription: false,
    autoFulfil: false,
  },
  pro: {
    paymentLinkEnvVar: "NEXT_PUBLIC_DIRECTORY_PAYMENT_LINK_PRO",
    amountCents: 1599,
    isSubscription: false,
    autoFulfil: false,
  },
  ultra: {
    paymentLinkEnvVar: "NEXT_PUBLIC_DIRECTORY_PAYMENT_LINK_ULTRA",
    amountCents: 1999,
    isSubscription: true,
    // Ultra has no manual fulfilment work — the deliverable IS the
    // sidebar slot, which is automated rendering. Marking fulfilled
    // immediately on payment lets the sponsor card go live on the
    // next page revalidation cycle without admin intervention.
    autoFulfil: true,
  },
}

export function isDirectoryTier(value: string): value is DirectoryTier {
  return (DIRECTORY_TIERS as readonly string[]).includes(value)
}

/**
 * Resolve the configured Stripe Payment Link URL for a tier. Throws
 * (rather than returning null) so a misconfigured server fails
 * loudly at request time instead of redirecting users to nowhere.
 */
export function getPaymentLinkUrl(tier: DirectoryTier): string {
  const cfg = DIRECTORY_TIER_CONFIG[tier]
  const url = process.env[cfg.paymentLinkEnvVar]
  if (!url) {
    throw new Error(`Missing env: ${cfg.paymentLinkEnvVar} (required for tier "${tier}")`)
  }
  return url
}
