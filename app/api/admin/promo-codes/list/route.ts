import { headers } from "next/headers"
import { NextResponse } from "next/server"

import { db } from "@/drizzle/db"
import { promoCode, user } from "@/drizzle/db/schema"
import { desc, eq } from "drizzle-orm"

import { auth } from "@/lib/auth"

/**
 * 获取所有优惠码列表（管理员专用）
 */
export async function GET() {
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

    // 获取所有优惠码
    const promoCodes = await db
      .select({
        id: promoCode.id,
        code: promoCode.code,
        discountAmount: promoCode.discountAmount,
        usageLimit: promoCode.usageLimit,
        usedCount: promoCode.usedCount,
        expiresAt: promoCode.expiresAt,
        isActive: promoCode.isActive,
        createdAt: promoCode.createdAt,
      })
      .from(promoCode)
      .orderBy(desc(promoCode.createdAt))
      .limit(100)

    return NextResponse.json({
      success: true,
      promoCodes,
    })
  } catch (error) {
    console.error("Error fetching promo codes:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
