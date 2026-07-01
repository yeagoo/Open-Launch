import { headers } from "next/headers"
import { NextResponse } from "next/server"

import * as z from "zod"

import { logAdminAction } from "@/lib/admin-audit"
import { auth } from "@/lib/auth"
import { takedownSkillSubmission } from "@/lib/skill-takedown"

export const dynamic = "force-dynamic"

const paramsSchema = z.object({
  uuid: z.string().uuid(),
})

export async function POST(_request: Request, { params }: { params: Promise<{ uuid: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const parsed = paramsSchema.safeParse(await params)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid submission id" }, { status: 400 })
  }

  const result = await takedownSkillSubmission(parsed.data.uuid, {
    reason: "Manual admin takedown",
    alertAdmin: false,
  })

  await logAdminAction({
    adminUserId: session.user.id,
    action: "skill_submission.takedown",
    targetType: "skill_submission",
    targetId: parsed.data.uuid,
    metadata: { ...result },
  })

  return NextResponse.json(result)
}
