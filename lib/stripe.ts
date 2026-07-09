import Stripe from "stripe"

export const STRIPE_API_VERSION = "2026-06-24.dahlia"

export function createStripeClient(): Stripe | null {
  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) return null

  return new Stripe(secretKey, {
    apiVersion: STRIPE_API_VERSION,
  })
}

export function createBuildSafeStripeClient(): Stripe {
  return new Stripe("sk_test_build_safe_placeholder", {
    apiVersion: STRIPE_API_VERSION,
  })
}
