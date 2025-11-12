import { headers } from "next/headers"
import { NextResponse } from "next/server"

import { db } from "@/drizzle/db"
import { promoCode, promoCodeUsage } from "@/drizzle/db/schema"
import { and, eq, sql } from "drizzle-orm"

import { auth } from "@/lib/auth"
import { PROMO_CODE_SETTINGS } from "@/lib/constants"

/**
 * 应用优惠码到项目
 * 在支付流程中调用，记录优惠码的使用
 */
export async function POST(request: Request) {
  try {
    // 验证用户身份
    const session = await auth.api.getSession({
      headers: await headers(),
    })

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { code, projectId } = await request.json()

    if (!code || typeof code !== "string" || !projectId) {
      return NextResponse.json({ error: "Invalid request parameters" }, { status: 400 })
    }

    // 查找优惠码
    const promoCodeData = await db
      .select()
      .from(promoCode)
      .where(and(eq(promoCode.code, code.toUpperCase()), eq(promoCode.isActive, true)))
      .limit(1)

    if (promoCodeData.length === 0) {
      return NextResponse.json({ error: "Invalid promo code" }, { status: 404 })
    }

    const promo = promoCodeData[0]

    // 再次检查优惠码是否过期
    if (promo.expiresAt && promo.expiresAt < new Date()) {
      return NextResponse.json({ error: "Promo code has expired" }, { status: 400 })
    }

    // 再次检查使用次数限制
    if (promo.usageLimit && promo.usedCount >= promo.usageLimit) {
      return NextResponse.json({ error: "Promo code usage limit reached" }, { status: 400 })
    }

    // 再次检查用户使用次数
    const userUsageCount = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(promoCodeUsage)
      .where(
        and(eq(promoCodeUsage.promoCodeId, promo.id), eq(promoCodeUsage.userId, session.user.id)),
      )

    const userUsed = userUsageCount[0]?.count || 0

    if (userUsed >= PROMO_CODE_SETTINGS.MAX_USES_PER_USER) {
      return NextResponse.json(
        {
          error: `Maximum usage limit (${PROMO_CODE_SETTINGS.MAX_USES_PER_USER} times) reached`,
        },
        { status: 400 },
      )
    }

    // 记录优惠码使用
    await db.insert(promoCodeUsage).values({
      id: crypto.randomUUID(),
      promoCodeId: promo.id,
      userId: session.user.id,
      projectId,
      usedAt: new Date(),
    })

    // 更新优惠码使用计数
    await db
      .update(promoCode)
      .set({
        usedCount: sql`${promoCode.usedCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(promoCode.id, promo.id))

    return NextResponse.json({
      success: true,
      discountAmount: promo.discountAmount,
    })
  } catch (error) {
    console.error("Error applying promo code:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
