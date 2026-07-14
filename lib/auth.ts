import { db } from "@/drizzle/db"
import { stripe } from "@better-auth/stripe"
import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { admin, captcha, oneTap } from "better-auth/plugins"

import { buildBetterAuthApiErrorLog } from "@/lib/auth-error-log"
import { sendEmail } from "@/lib/email"
import { getPasswordResetTemplate, getVerificationEmailTemplate } from "@/lib/email-templates"
import { redactEmail } from "@/lib/log-redaction"
import { createBuildSafeStripeClient, createStripeClient } from "@/lib/stripe"

const stripeClient = createStripeClient()
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET
const stripeConfigured = Boolean(stripeClient && stripeWebhookSecret)
const authSecret =
  process.env.BETTER_AUTH_SECRET ||
  (process.env.CI ? "open-launch-ci-build-secret-do-not-use-in-production" : undefined)

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_URL || "http://localhost:3000",
  secret: authSecret,
  database: drizzleAdapter(db, {
    provider: "pg",
  }),
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
        console.error(`❌ Failed to send verification email to ${redactEmail(user.email)}:`, error)
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
  },
  advanced: {
    ipAddress: {
      // Production traffic reaches Zeabur through Cloudflare. Better Auth must
      // use the single-value header overwritten by that trusted edge instead
      // of collapsing all users into one shared path bucket when it rejects a
      // comma-separated X-Forwarded-For chain.
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
      ? ["http://localhost:3000", "https://www.aat.ee"]
      : ["https://www.aat.ee"],
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
      endpoints: ["/sign-up/email", "/sign-in/email", "/forget-password"],
    }),
    oneTap({
      clientId: process.env.NEXT_PUBLIC_ONE_TAP_CLIENT_ID!,
    }),
    admin({}),
  ],
})
