import { db } from "@/drizzle/db"
import { stripe } from "@better-auth/stripe"
import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { admin, captcha, oneTap } from "better-auth/plugins"
import Stripe from "stripe"

import { sendEmail } from "@/lib/email"
import { getPasswordResetTemplate, getVerificationEmailTemplate } from "@/lib/email-templates"

const stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY!)

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_URL || "http://localhost:3000",
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
        console.log(`✅ Verification email sent to ${user.email}`)
      } catch (error) {
        console.error(`❌ Failed to send verification email to ${user.email}:`, error)
        throw error
      }
    },
    expiresIn: 86400,
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
  trustedOrigins: [
    process.env.NODE_ENV !== "development" ? "https://www.aat.ee" : "http://localhost:3000",
    "https://www.aat.ee", // 添加您的域名（HTTPS）
    "http://www.aat.ee", // 添加您的域名（HTTP）
  ].filter(Boolean),
  plugins: [
    stripe({
      stripeClient,
      stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
      createCustomerOnSignUp: true,
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
