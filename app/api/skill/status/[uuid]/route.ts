import { NextResponse } from "next/server"

import * as z from "zod"

import { getSkillStatusView } from "@/lib/skill-status"

export const dynamic = "force-dynamic"

const paramsSchema = z.object({
  uuid: z.string().uuid(),
})

export async function GET(_request: Request, { params }: { params: Promise<{ uuid: string }> }) {
  const parsed = paramsSchema.safeParse(await params)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid submission id" }, { status: 400 })
  }

  const status = await getSkillStatusView(parsed.data.uuid)
  if (!status) {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 })
  }

  return NextResponse.json({ submission: status })
}
