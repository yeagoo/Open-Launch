import { revalidatePath } from "next/cache"
import { headers } from "next/headers"
import { NextResponse } from "next/server"

import { db } from "@/drizzle/db"
import { launchStatus, project } from "@/drizzle/db/schema"
import { eq } from "drizzle-orm"
import type Stripe from "stripe"

import { auth } from "@/lib/auth"
import { LAUNCH_SETTINGS } from "@/lib/constants"
import { confirmPaidPremiumLaunch } from "@/lib/premium-launch-confirmation"
import { notifyDiscordForScheduledProject } from "@/lib/project-launch-notification"
import { checkRateLimit } from "@/lib/rate-limit"
import { createStripeClient } from "@/lib/stripe"

const PREMIUM_PRICE_CENTS = Math.round(LAUNCH_SETTINGS.PREMIUM_PRICE * 100)
const EXPECTED_CURRENCY = "usd"

// Mirrors the webhook guard: charged amount must match the expected price
// AND be in the expected currency (399 JPY must not satisfy a 399-USD-cent
// check), adding the promo-code discount back. A wrong currency or a
// non-numeric total is treated as a mismatch rather than silently trusted.
function chargedAmountMatches(session: Stripe.Checkout.Session, expectedCents: number): boolean {
  if (session.currency !== EXPECTED_CURRENCY) return false
  if (typeof session.amount_total !== "number") return false
  const discountCents = session.total_details?.amount_discount ?? 0
  return session.amount_total + discountCents === expectedCents
}

export async function GET(request: Request) {
  try {
    // Require an authenticated user. This endpoint is only ever hit from
    // the post-checkout success page where the buyer is logged in. The
    // session also rate-limits the (paid) Stripe `sessions.retrieve`
    // call below so it can't be used as an unauthenticated cost-
    // amplification / enumeration vector.
    const session_ = await auth.api.getSession({ headers: await headers() })
    if (!session_?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const rate = await checkRateLimit(`payment-verify:${session_.user.id}`, 20, 60 * 1000, {
      onRedisError: "fail-closed",
    })
    if (!rate.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }

    const { searchParams } = new URL(request.url)
    const sessionId = searchParams.get("session_id")

    if (!sessionId) {
      return NextResponse.json({ error: "Missing session ID" }, { status: 400 })
    }

    const stripe = createStripeClient()
    if (!stripe) {
      console.error("❌ STRIPE_SECRET_KEY is not configured")
      return NextResponse.json({ error: "Stripe configuration error" }, { status: 500 })
    }

    // Verify with Stripe that this session is real and paid
    const session = await stripe.checkout.sessions.retrieve(sessionId)

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 })
    }

    const projectId = session.client_reference_id

    if (!projectId) {
      return NextResponse.json({ error: "No project ID found in session" }, { status: 400 })
    }

    if (session.payment_status === "paid") {
      const [projectData] = await db
        .select({
          id: project.id,
          slug: project.slug,
          launchStatus: project.launchStatus,
          launchType: project.launchType,
          scheduledLaunchDate: project.scheduledLaunchDate,
          createdBy: project.createdBy,
          premiumPriceCents: project.premiumPriceCents,
        })
        .from(project)
        .where(eq(project.id, projectId))

      if (!projectData) {
        return NextResponse.json({ error: "Project not found" }, { status: 404 })
      }

      // Ownership guard: only the project owner may drive its
      // payment-confirmation fast path.
      if (projectData.createdBy !== session_.user.id) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }

      // Amount guard — ONLY while still PAYMENT_PENDING (first confirmation).
      // A tampered/underpaid first session must NOT report success: return a
      // non-complete status so the success page shows "please retry" rather
      // than "Payment Successful". Once the project is already scheduled (by
      // the webhook or an earlier verify), skip this check and fall through
      // to the idempotent success response — otherwise an old success-URL
      // refresh after a price change would wrongly show "failed" for an
      // already-launched project. Validate against the price captured at
      // schedule time, falling back to the constant for legacy rows.
      if (projectData.launchStatus === launchStatus.PAYMENT_PENDING) {
        const expectedPremiumCents = projectData.premiumPriceCents ?? PREMIUM_PRICE_CENTS
        if (!chargedAmountMatches(session, expectedPremiumCents)) {
          console.error(
            `⚠️ payment/verify amount mismatch — not confirming. expected=${expectedPremiumCents}¢, stripe=${session.amount_total}, project=${projectId}`,
          )
          return NextResponse.json({ status: "failed", reason: "amount_mismatch" })
        }
      }

      let confirmedLaunchStatus = projectData.launchStatus
      if (
        projectData.launchStatus === launchStatus.PAYMENT_PENDING &&
        !projectData.scheduledLaunchDate
      ) {
        return NextResponse.json({ status: "failed", reason: "invalid_project" })
      }
      if (projectData.scheduledLaunchDate) {
        const confirmation = await confirmPaidPremiumLaunch(projectId)
        if (confirmation.status === "rejected") {
          return NextResponse.json({ status: "failed", reason: confirmation.reason })
        }
        if (confirmation.status === "scheduled") {
          confirmedLaunchStatus = launchStatus.SCHEDULED
          console.log("⚡ Fast Path: Payment verified for", projectId)
          try {
            await notifyDiscordForScheduledProject(projectId, session_.user.id)
          } catch (notificationError) {
            console.error("Failed to send paid-launch Discord notification", notificationError)
          }
          revalidatePath("/projects")
          revalidatePath("/sitemap.xml")
          try {
            revalidatePath(`/projects/${projectData.slug}`)
          } catch (e) {
            console.error("Error revalidating slug path", e)
          }
        } else {
          confirmedLaunchStatus = confirmation.launchStatus
        }
      }

      return NextResponse.json({
        status: "complete",
        projectId: projectData.id,
        projectSlug: projectData.slug,
        launchStatus: confirmedLaunchStatus,
      })
    } else if (session.payment_status === "unpaid") {
      return NextResponse.json({ status: "pending" })
    } else {
      return NextResponse.json({ status: "failed" })
    }
  } catch (error) {
    console.error("Error verifying payment:", error)
    return NextResponse.json({ error: "Failed to verify payment" }, { status: 500 })
  }
}
