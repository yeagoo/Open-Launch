/**
 * Returns the absolute URL prefix for outbound links / redirect
 * targets (Stripe return URLs, transactional email CTAs, etc.).
 *
 * Resolution order:
 *   1. `NEXT_PUBLIC_URL` (canonical — set in real `.env`)
 *   2. `NEXT_PUBLIC_APP_URL` (legacy alias retained for backward
 *      compatibility with older `.env.example` entries)
 *   3. In production: throw — a misconfigured deploy should fail
 *      loudly rather than silently shipping stale-host links
 *   4. In development: fall back to `http://localhost:3000`
 *
 * Exists so we don't hard-code `https://aat.ee` as a fallback that
 * accidentally redirects local-dev users into production.
 */
export function resolveAppUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (fromEnv) return fromEnv
  if (process.env.NODE_ENV === "production") {
    throw new Error("NEXT_PUBLIC_URL is not set in production")
  }
  return "http://localhost:3000"
}
