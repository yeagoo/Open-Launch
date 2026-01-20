import { revalidatePath } from "next/cache"
import { NextResponse } from "next/server"

import { db } from "@/drizzle/db"
import { launchQuota, launchStatus, launchType, project } from "@/drizzle/db/schema"
import { eq, sql } from "drizzle-orm"
import Stripe from "stripe"

// Initialiser le client Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export async function GET(request: Request) {
  try {
    // Récupérer l'ID de session des paramètres de requête
    const { searchParams } = new URL(request.url)
    const sessionId = searchParams.get("session_id")

    if (!sessionId) {
      return NextResponse.json({ error: "Missing session ID" }, { status: 400 })
    }

    // Récupérer les détails de la session depuis Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId)

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 })
    }

    // Récupérer l'ID du projet depuis la session
    const projectId = session.client_reference_id

    if (!projectId) {
      return NextResponse.json({ error: "No project ID found in session" }, { status: 400 })
    }

    // Vérifier le statut du paiement
    if (session.payment_status === "paid") {
      // Récupérer les informations du projet
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

      // FAST PATH: Update status if still pending (prevents race condition with webhook)
      // This ensures the user sees the project immediately after redirect
      if (
        projectData.launchType === launchType.PREMIUM &&
        projectData.launchStatus === launchStatus.PAYMENT_PENDING &&
        projectData.scheduledLaunchDate
      ) {
        console.log("⚡ Fast Path: Updating payment status in verify endpoint for", projectId)

        // Update project status to 'scheduled'
        await db
          .update(project)
          .set({
            launchStatus: launchStatus.SCHEDULED,
            featuredOnHomepage: false,
            updatedAt: new Date(),
          })
          .where(eq(project.id, projectId))

        // Update Launch Quota (same logic as webhook)
        const launchDate = projectData.scheduledLaunchDate
        const quotaResult = await db
          .select()
          .from(launchQuota)
          .where(eq(launchQuota.date, launchDate))
          .limit(1)

        if (quotaResult.length === 0) {
          // Create new quota
          await db.insert(launchQuota).values({
            id: crypto.randomUUID(),
            date: launchDate,
            freeCount: 0,
            badgeCount: 0,
            premiumCount: 1, // Premium count = 1
            createdAt: new Date(),
            updatedAt: new Date(),
          })
        } else {
          // Update existing quota
          await db
            .update(launchQuota)
            .set({
              premiumCount: sql`${launchQuota.premiumCount} + 1`,
              updatedAt: new Date(),
            })
            .where(eq(launchQuota.id, quotaResult[0].id))
        }

        // Revalidate paths
        revalidatePath("/projects")
        revalidatePath("/sitemap.xml")
        try {
          revalidatePath(`/projects/${projectData.slug}`)
        } catch (e) {
          console.error("Error revalidating slug path", e)
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
