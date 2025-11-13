import { revalidatePath } from "next/cache"
import { NextResponse } from "next/server"

import { db } from "@/drizzle/db"
import { launchQuota, launchStatus, launchType, project } from "@/drizzle/db/schema"
import { eq, sql } from "drizzle-orm"
import Stripe from "stripe"

// Initialiser le client Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!

export async function POST(request: Request) {
  try {
    // 检查环境变量是否配置
    if (!process.env.STRIPE_SECRET_KEY) {
      console.error("❌ STRIPE_SECRET_KEY is not configured")
      return NextResponse.json({ error: "Stripe configuration error" }, { status: 500 })
    }
    if (!webhookSecret) {
      console.error("❌ STRIPE_WEBHOOK_SECRET is not configured")
      return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 })
    }

    const body = await request.text()
    const signature = request.headers.get("stripe-signature") as string

    if (!signature) {
      console.error("❌ No stripe-signature header found")
      return NextResponse.json({ error: "No signature header" }, { status: 400 })
    }

    // Vérifier la signature du webhook
    let event: Stripe.Event
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
      console.log("✅ Webhook signature verified, event type:", event.type)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error"
      console.error("❌ Webhook signature verification failed:", errorMessage)
      return NextResponse.json({ error: "Webhook signature verification failed" }, { status: 400 })
    }

    // Traiter l'événement
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session

      // Find the project using client_reference_id (which we set as projectId)
      const projectId = session.client_reference_id
      if (!projectId) {
        console.error("⚠️ No project ID found in session metadata, session_id:", session.id)
        // 返回 200 避免 Stripe 重试，但记录错误
        return NextResponse.json({ received: true, warning: "No project ID" }, { status: 200 })
      }

      console.log("📦 Processing payment for project:", projectId)

      // Vérifier si le paiement a réussi
      if (session.payment_status === "paid") {
        // Récupérer les informations de la chaîne
        const [projectData] = await db
          .select({
            id: project.id,
            launchType: project.launchType,
            scheduledLaunchDate: project.scheduledLaunchDate,
          })
          .from(project)
          .where(eq(project.id, projectId))

        if (!projectData) {
          console.error("⚠️ Project not found:", projectId)
          // 返回 200 避免 Stripe 无限重试
          return NextResponse.json(
            { received: true, warning: "Project not found" },
            { status: 200 },
          )
        }

        if (!projectData.scheduledLaunchDate) {
          console.error("⚠️ Project data incomplete:", projectId)
          return NextResponse.json(
            { received: true, warning: "Project data incomplete" },
            { status: 200 },
          )
        }

        console.log("✅ Project found, scheduled date:", projectData.scheduledLaunchDate)

        // Update the project status to 'scheduled'
        await db
          .update(project)
          .set({
            launchStatus: launchStatus.SCHEDULED,
            // Premium Launch 不自动 featured，需要用户主动选择
            featuredOnHomepage: false,
            updatedAt: new Date(),
          })
          .where(eq(project.id, projectId))

        // 重新生成 sitemap（项目即将上架）
        revalidatePath("/sitemap.xml")
        console.log("✅ Sitemap regenerated after premium project payment")

        // Mettre à jour le quota pour cette date
        const launchDate = projectData.scheduledLaunchDate
        const quotaResult = await db
          .select()
          .from(launchQuota)
          .where(eq(launchQuota.date, launchDate))
          .limit(1)

        if (quotaResult.length === 0) {
          // Créer un nouveau quota
          await db.insert(launchQuota).values({
            id: crypto.randomUUID(),
            date: launchDate,
            freeCount: 0,
            badgeCount: 0,
            premiumCount: projectData.launchType === launchType.PREMIUM ? 1 : 0,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
        } else {
          // Mettre à jour le quota existant
          await db
            .update(launchQuota)
            .set({
              premiumCount:
                projectData.launchType === launchType.PREMIUM
                  ? sql`${launchQuota.premiumCount} + 1`
                  : launchQuota.premiumCount,
              updatedAt: new Date(),
            })
            .where(eq(launchQuota.id, quotaResult[0].id))
        }

        // Revalidate the project page path using the project ID
        try {
          revalidatePath(`/projects`) // Revalidation plus large pour l'instant
          console.log(`✅ Revalidated path for project: ${projectId}`)
        } catch (revalidateError) {
          console.error("⚠️ Error revalidating path:", revalidateError)
        }

        console.log("✅ Webhook processed successfully for project:", projectId)
        return NextResponse.json({ success: true }, { status: 200 })
      } else {
        // Si le paiement n'a pas réussi, mettre à jour le statut à PAYMENT_FAILED
        console.log("⚠️ Payment not completed, status:", session.payment_status)
        await db
          .update(project)
          .set({
            launchStatus: launchStatus.PAYMENT_FAILED,
            updatedAt: new Date(),
          })
          .where(eq(project.id, projectId))

        return NextResponse.json({ success: true }, { status: 200 })
      }
    } else if (event.type === "checkout.session.expired") {
      const session = event.data.object as Stripe.Checkout.Session
      const projectId = session.client_reference_id

      console.log("⏰ Checkout session expired, session_id:", session.id)

      if (projectId) {
        // Mettre à jour le statut de la chaîne à PAYMENT_FAILED
        await db
          .update(project)
          .set({
            launchStatus: launchStatus.PAYMENT_FAILED,
            updatedAt: new Date(),
          })
          .where(eq(project.id, projectId))
        console.log("✅ Updated project status to PAYMENT_FAILED:", projectId)
      }

      return NextResponse.json({ success: true }, { status: 200 })
    }

    // Pour les autres types d'événements
    console.log("ℹ️ Received event type:", event.type, "(not handled)")
    return NextResponse.json({ received: true }, { status: 200 })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    const errorStack = error instanceof Error ? error.stack : undefined
    console.error("❌ Webhook error:", errorMessage)
    if (errorStack) {
      console.error("Stack trace:", errorStack)
    }
    // 返回 500 让 Stripe 重试（这是真正的服务器错误）
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 })
  }
}
