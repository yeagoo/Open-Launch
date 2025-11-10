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
        subject: "重置你的密码 - aat.ee",
        html,
      })
    },
  },
  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      // 详细调试日志
      console.log("=".repeat(60))
      console.log("📧 [RESEND DEBUG] Email verification triggered")
      console.log("=".repeat(60))
      console.log("User Email:", user.email)
      console.log("User Name:", user.name)
      console.log("Verification URL:", url)
      console.log("")
      console.log("Environment Variables Check:")
      console.log(
        "  RESEND_API_KEY:",
        process.env.RESEND_API_KEY
          ? `✅ Set (${process.env.RESEND_API_KEY.substring(0, 10)}...)`
          : "❌ NOT SET",
      )
      console.log(
        "  RESEND_FROM_EMAIL:",
        process.env.RESEND_FROM_EMAIL || "⚠️ Not set (will use default)",
      )
      console.log("=".repeat(60))

      const html = getVerificationEmailTemplate(user.name, url)

      try {
        console.log("📤 Sending email...")
        const result = await sendEmail({
          to: user.email,
          subject: "验证你的邮箱地址 - aat.ee",
          html,
        })
        console.log("✅ Email sent successfully!")
        console.log("Result:", JSON.stringify(result, null, 2))
        console.log("=".repeat(60))
      } catch (error) {
        console.error("❌ Email sending FAILED!")
        console.error("Error:", error)
        console.log("=".repeat(60))
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
