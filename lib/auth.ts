import { db } from "@/drizzle/db"
import { stripe } from "@better-auth/stripe"
import { APIError, betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { admin, captcha, oneTap } from "better-auth/plugins"

import { buildBetterAuthApiErrorLog } from "@/lib/auth-error-log"
import { sendEmail } from "@/lib/email"
import { getPasswordResetTemplate, getVerificationEmailTemplate } from "@/lib/email-templates"
import { redactEmail } from "@/lib/log-redaction"
import { getSharedRedisClient } from "@/lib/rate-limit"
import { createBuildSafeStripeClient, createStripeClient } from "@/lib/stripe"
import { isSafeProfileImageUrl } from "@/lib/user-profile-validation"

const stripeClient = createStripeClient()
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET
const stripeConfigured = Boolean(stripeClient && stripeWebhookSecret)
const authSecret =
  process.env.BETTER_AUTH_SECRET ||
  (process.env.CI ? "open-launch-ci-build-secret-do-not-use-in-production" : undefined)

// Shared Redis secondary storage: better-auth's built-in rate limiter is
// per-process memory by default, which multiplies the effective limit by
// the instance count. The optional atomic `increment` keeps its counting
// correct across instances; without REDIS_URL we keep the library default.
const authRedis = process.env.REDIS_URL ? getSharedRedisClient() : null

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_URL || "http://localhost:3000",
  secret: authSecret,
  database: drizzleAdapter(db, {
    provider: "pg",
  }),
  secondaryStorage: authRedis
    ? {
        // All wrappers degrade gracefully on Redis errors: reads miss to
        // null (Better Auth then falls back to Postgres, which stays
        // authoritative via storeSessionInDatabase/storeInDatabase below),
        // writes are best-effort cache writes. A transient Redis outage
        // must never take down auth.
        get: async (key) => {
          try {
            return await authRedis.get(key)
          } catch (err) {
            console.error("[auth-secondary-storage] get failed:", (err as Error).message)
            return null
          }
        },
        set: async (key, value, ttl) => {
          try {
            if (ttl) await authRedis.set(key, value, "EX", ttl)
            else await authRedis.set(key, value)
          } catch (err) {
            console.error("[auth-secondary-storage] set failed:", (err as Error).message)
          }
        },
        delete: async (key) => {
          try {
            await authRedis.del(key)
          } catch (err) {
            console.error("[auth-secondary-storage] delete failed:", (err as Error).message)
          }
        },
        // Atomic INCR/EXPIRE keeps the built-in rate limiter correct when
        // more than one instance serves traffic. On Redis error, allow the
        // request (count=1): auth availability beats rate-limit strictness
        // during a cache outage, same trade-off as lib/rate-limit.ts's
        // memory fallback.
        increment: async (key, ttl) => {
          try {
            const count = await authRedis.incr(key)
            if (count === 1 && ttl) await authRedis.expire(key, ttl)
            return count
          } catch (err) {
            console.error("[auth-secondary-storage] increment failed:", (err as Error).message)
            return 1
          }
        },
      }
    : undefined,
  verification: {
    // Keep verification / password-reset tokens in Postgres. With
    // secondaryStorage configured they'd otherwise live in Redis only — a
    // flush or redeploy would silently invalidate every outstanding
    // verification and reset email.
    storeInDatabase: true,
  },
  databaseHooks: {
    user: {
      create: {
        async before(user) {
          if (!isSafeProfileImageUrl(user.image)) {
            throw new APIError("BAD_REQUEST", { message: "Profile image must be an HTTP URL" })
          }
        },
      },
      update: {
        async before(user) {
          if ("image" in user && !isSafeProfileImageUrl(user.image)) {
            throw new APIError("BAD_REQUEST", { message: "Profile image must be an HTTP URL" })
          }
        },
      },
    },
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url }) => {
      const html = getPasswordResetTemplate(user.name, url)

      await sendEmail({
        to: user.email,
        subject: "Reset Your Password - aat.ee",
        html,
      })
    },
  },
  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      const html = getVerificationEmailTemplate(user.name, url)

      try {
        await sendEmail({
          to: user.email,
          subject: "Verify Your Email - aat.ee",
          html,
        })
        console.log(`✅ Verification email sent to ${redactEmail(user.email)}`)
      } catch (error) {
        console.error("❌ Failed to send verification email:", redactEmail(user.email), error)
        throw error
      }
    },
    expiresIn: 86400,
  },
  session: {
    // Explicit lifetime instead of relying on library defaults: a
    // session lives 7 days, sliding — any request within the last
    // day of validity extends it. Bounds the window a stolen session
    // token stays usable.
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    // Keep the AUTHORITATIVE session store in Postgres even though
    // secondaryStorage (Redis) is configured above. Without this, sessions
    // move to Redis-only: existing DB sessions stop resolving (instant
    // logout on deploy) and any Redis flush kills every session. Redis is
    // only the shared rate-limit counter + session cache here.
    storeSessionInDatabase: true,
  },
  advanced: {
    ipAddress: {
      // Production traffic reaches the service through Cloudflare. Better Auth
      // must use the single-value header overwritten by that trusted edge
      // instead of collapsing all users into one shared path bucket when it
      // rejects a comma-separated X-Forwarded-For chain.
      ipAddressHeaders: ["cf-connecting-ip"],
    },
  },
  onAPIError: {
    // Better Auth's default structured logger can collapse Node errors to the
    // message only. Preserve the stack so any provider-specific OAuth failure
    // that remains after removing the global fetch monkey-patch is actionable,
    // while redacting OAuth codes/tokens before they reach production logs.
    onError(error) {
      console.error("[better-auth-api-error]", JSON.stringify(buildBetterAuthApiErrorLog(error)))
    },
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
    github: {
      clientId: process.env.GITHUB_CLIENT_ID as string,
      clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
    },
  },
  trustedOrigins:
    process.env.NODE_ENV === "development"
      ? ["http://localhost:3000", "https://www.aat.ee", "https://aat.ee"]
      : ["https://www.aat.ee", "https://aat.ee"],
  plugins: [
    stripe({
      stripeClient: stripeClient ?? createBuildSafeStripeClient(),
      // ⚠️ The webhook this plugin mounts at /api/auth/stripe/webhook is
      // INTENTIONALLY DEAD. Our explicit static route
      // (app/api/auth/stripe/webhook/route.ts) sits at the same path and
      // wins Next.js route precedence (static segments beat the [...all]
      // catch-all), so this plugin's handler never runs. The custom route
      // is authoritative — it knows about directoryOrder + project
      // scheduling, which this plugin does not. DO NOT delete the static
      // route: if it's removed, this no-op handler silently takes over and
      // every payment becomes an orphan. The secret stays only because the
      // plugin's type requires it (used for customer creation, not events).
      stripeWebhookSecret: stripeWebhookSecret ?? "whsec_build_safe_placeholder",
      createCustomerOnSignUp: stripeConfigured,
    }),
    captcha({
      provider: "cloudflare-turnstile", // or "google-recaptcha"
      secretKey: process.env.TURNSTILE_SECRET_KEY!,
      // NOTE: /change-password is deliberately NOT here — the settings page
      // submits only passwords (no Turnstile token), so captcha-gating it
      // would 400 every legitimate change. Adding it requires wiring a
      // Turnstile widget into the settings UI first.
      endpoints: [
        "/sign-up/email",
        "/sign-in/email",
        "/forget-password",
        "/send-verification-email",
      ],
    }),
    oneTap({
      clientId: process.env.NEXT_PUBLIC_ONE_TAP_CLIENT_ID!,
    }),
    admin({}),
  ],
})
