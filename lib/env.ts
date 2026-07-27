/**
 * Startup environment validation.
 *
 * Until now a missing critical env var (DATABASE_URL, Stripe keys, ...) let
 * the process boot happily and fail on the first request with an obscure
 * error. `validateRuntimeEnv()` is called once from instrumentation
 * register() (Node runtime only) and fails fast in production, listing
 * every missing variable at once.
 *
 * Tiers:
 *   REQUIRED  — the process cannot serve correct behavior without these.
 *   OPTIONAL  — feature-scoped; a missing one only degrades its feature
 *               (AI crons circuit-break, ProductHunt import skips, ...),
 *               so we warn instead of crashing.
 *
 * Deliberately NOT imported by drizzle/db or other modules: the Docker
 * builder intentionally has no runtime secrets (see Dockerfile), so any
 * module-scope evaluation would break `next build`. The only call site is
 * instrumentation register(), which also skips the production build phase.
 */

// Keep in sync with docs/production-runtime.md.
const REQUIRED_RUNTIME_ENV = [
  "DATABASE_URL",
  "BETTER_AUTH_SECRET",
  // Auth providers + captcha (lib/auth.ts casts these to string —
  // undefined here means broken sign-in, not a boot error).
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GITHUB_CLIENT_ID",
  "GITHUB_CLIENT_SECRET",
  "TURNSTILE_SECRET_KEY",
  // Payments.
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  // Rate limiting / cron dedupe / auth secondary storage.
  "REDIS_URL",
  // Transactional email + admin alerts.
  "RESEND_API_KEY",
  // Image uploads.
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_NAME",
  // Without this, uploadFileToR2 stores the object and only then throws
  // building the public URL — a failed upload with the side effect done.
  "R2_PUBLIC_DOMAIN",
  // Cron endpoint auth (embedded cron + external triggers).
  "CRON_API_KEY",
] as const

const OPTIONAL_FEATURE_ENV = [
  "DEEPSEEK_API_KEY", // AI crons (circuit-broken when absent)
  "TINYFISH_API_KEY", // badge re-verify + auto-fill crawl fallback
  "PRODUCTHUNT_API_KEY", // ProductHunt import cron
  "EXTERNAL_LAUNCH_API_KEY", // launch syndication gateway
  "SKILL_PUBLISH_API_KEY", // skill directory publishing
  "CRON_HEARTBEAT_URL", // dead-man heartbeat for the scheduler
  "NEXT_PUBLIC_ONE_TAP_CLIENT_ID", // Google One Tap
  "ADMIN_EMAIL", // admin notification recipient
] as const

/**
 * Validates process.env. In production throws an Error listing every
 * missing required variable; outside production it logs the same list as a
 * warning so `next dev` and CI keep working with partial env.
 */
export function validateRuntimeEnv(): void {
  const missing = REQUIRED_RUNTIME_ENV.filter((name) => !process.env[name])
  const missingOptional = OPTIONAL_FEATURE_ENV.filter((name) => !process.env[name])

  if (missingOptional.length > 0) {
    console.warn(
      `[env] optional feature variables not set (features degrade gracefully): ${missingOptional.join(", ")}`,
    )
  }

  if (missing.length === 0) return

  const message = `[env] missing required environment variables: ${missing.join(", ")}`
  if (process.env.NODE_ENV === "production") {
    throw new Error(message)
  }
  console.warn(message)
}
