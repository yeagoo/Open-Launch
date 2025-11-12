import { headers } from "next/headers"
import { NextResponse } from "next/server"

import { db } from "@/drizzle/db"
import { promoCode, user } from "@/drizzle/db/schema"
import { eq } from "drizzle-orm"

import { auth } from "@/lib/auth"
import { PROMO_CODE_SETTINGS } from "@/lib/constants"

/**
 * 生成随机优惠码
 */
function generatePromoCode(prefix: string = "LAUNCH", length: number = 8): string {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
  let code = prefix + "-"

  for (let i = 0; i < length; i++) {
    code += characters.charAt(Math.floor(Math.random() * characters.length))
  }

  return code
}

/**
 * 批量生成优惠码（管理员专用）
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

    // 检查是否是管理员
    const userData = await db.select().from(user).where(eq(user.id, session.user.id)).limit(1)

    if (userData.length === 0 || userData[0].role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const {
      count = 1,
      prefix = "LAUNCH",
      discountAmount = PROMO_CODE_SETTINGS.DISCOUNT_AMOUNT,
      usageLimit = null,
      validityDays = PROMO_CODE_SETTINGS.VALIDITY_DAYS,
    } = await request.json()

    // 验证参数
    if (count < 1 || count > 100) {
      return NextResponse.json({ error: "Count must be between 1 and 100" }, { status: 400 })
    }

    if (discountAmount < 0 || discountAmount > 1000) {
      return NextResponse.json(
        { error: "Discount amount must be between 0 and 1000" },
        { status: 400 },
      )
    }

    // 计算过期时间
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + validityDays)

    // 生成优惠码
    const promoCodes: string[] = []
    const promoCodeRecords = []

    for (let i = 0; i < count; i++) {
      let code = generatePromoCode(prefix)

      // 确保优惠码唯一
      let attempts = 0
      while (attempts < 10) {
        const existing = await db.select().from(promoCode).where(eq(promoCode.code, code)).limit(1)

        if (existing.length === 0) {
          break
        }

        code = generatePromoCode(prefix)
        attempts++
      }

      if (attempts >= 10) {
        return NextResponse.json(
          { error: "Failed to generate unique promo codes" },
          { status: 500 },
        )
      }

      promoCodes.push(code)

      promoCodeRecords.push({
        id: crypto.randomUUID(),
        code,
        discountAmount,
        usageLimit: usageLimit || null,
        usedCount: 0,
        expiresAt,
        isActive: true,
        createdBy: session.user.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    }

    // 批量插入优惠码
    await db.insert(promoCode).values(promoCodeRecords)

    return NextResponse.json({
      success: true,
      count: promoCodes.length,
      promoCodes,
      expiresAt,
    })
  } catch (error) {
    console.error("Error generating promo codes:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
