import { headers } from "next/headers"
import { NextResponse } from "next/server"

import { db } from "@/drizzle/db"
import { promoCode, promoCodeUsage } from "@/drizzle/db/schema"
import { and, eq, sql } from "drizzle-orm"

import { auth } from "@/lib/auth"
import { PROMO_CODE_SETTINGS } from "@/lib/constants"

export async function POST(request: Request) {
  try {
    // 验证用户身份
    const session = await auth.api.getSession({
      headers: await headers(),
    })

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { code } = await request.json()

    if (!code || typeof code !== "string") {
      return NextResponse.json({ error: "Invalid code format" }, { status: 400 })
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

    // 检查优惠码是否过期
    if (promo.expiresAt && promo.expiresAt < new Date()) {
      return NextResponse.json({ error: "Promo code has expired" }, { status: 400 })
    }

    // 检查使用次数限制
    if (promo.usageLimit && promo.usedCount >= promo.usageLimit) {
      return NextResponse.json({ error: "Promo code usage limit reached" }, { status: 400 })
    }

    // 检查用户使用次数
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
          error: `You have reached the maximum usage limit (${PROMO_CODE_SETTINGS.MAX_USES_PER_USER} times) for this promo code`,
        },
        { status: 400 },
      )
    }

    // 返回优惠码信息
    return NextResponse.json({
      success: true,
      promoCode: {
        id: promo.id,
        code: promo.code,
        discountAmount: promo.discountAmount,
        remainingUses: promo.usageLimit ? promo.usageLimit - promo.usedCount : null,
        userRemainingUses: PROMO_CODE_SETTINGS.MAX_USES_PER_USER - userUsed,
        expiresAt: promo.expiresAt,
      },
    })
  } catch (error) {
    console.error("Error verifying promo code:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
