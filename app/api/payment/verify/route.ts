import { revalidatePath } from "next/cache"
import { NextResponse } from "next/server"

import { db } from "@/drizzle/db"
import { launchQuota, launchStatus, launchType, project } from "@/drizzle/db/schema"
import { and, eq, sql } from "drizzle-orm"
import Stripe from "stripe"

// Pinned to the SDK's latest known API version — see
// `app/api/auth/stripe/webhook/route.ts` for the rationale.
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-02-24.acacia",
})

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const sessionId = searchParams.get("session_id")

    if (!sessionId) {
      return NextResponse.json({ error: "Missing session ID" }, { status: 400 })
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
        })
        .from(project)
        .where(eq(project.id, projectId))

      if (!projectData) {
        return NextResponse.json({ error: "Project not found" }, { status: 404 })
      }

      // Atomic conditional update: only transition PAYMENT_PENDING → SCHEDULED
      // The WHERE clause ensures only the first writer (verify OR webhook) succeeds
      if (projectData.scheduledLaunchDate) {
        const updateResult = await db
          .update(project)
          .set({
            launchStatus: launchStatus.SCHEDULED,
            featuredOnHomepage: false,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(project.id, projectId),
              eq(project.launchType, launchType.PREMIUM),
              eq(project.launchStatus, launchStatus.PAYMENT_PENDING),
            ),
          )

        // Only update quota if THIS request actually performed the transition
        if (updateResult.rowCount && updateResult.rowCount > 0) {
          console.log("⚡ Fast Path: Payment verified for", projectId)

          const launchDate = projectData.scheduledLaunchDate
          const quotaResult = await db
            .select()
            .from(launchQuota)
            .where(eq(launchQuota.date, launchDate))
            .limit(1)

          if (quotaResult.length === 0) {
            await db.insert(launchQuota).values({
              id: crypto.randomUUID(),
              date: launchDate,
              freeCount: 0,
              badgeCount: 0,
              premiumCount: 1,
              createdAt: new Date(),
              updatedAt: new Date(),
            })
          } else {
            await db
              .update(launchQuota)
              .set({
                premiumCount: sql`${launchQuota.premiumCount} + 1`,
                updatedAt: new Date(),
              })
              .where(eq(launchQuota.id, quotaResult[0].id))
          }

          revalidatePath("/projects")
          revalidatePath("/sitemap.xml")
          try {
            revalidatePath(`/projects/${projectData.slug}`)
          } catch (e) {
            console.error("Error revalidating slug path", e)
          }
        }
      }

      return NextResponse.json({
        status: "complete",
        projectId: projectData.id,
        projectSlug: projectData.slug,
        launchStatus:
          projectData.launchStatus === launchStatus.PAYMENT_PENDING
            ? launchStatus.SCHEDULED
            : projectData.launchStatus,
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
