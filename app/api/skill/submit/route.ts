import { NextResponse } from "next/server"

import { readRequestJsonBounded } from "@/lib/read-request-body"
import { verifySkillApiKey } from "@/lib/skill-auth"
import {
  buildSkillStatusUrl,
  skillSubmitRequestSchema,
  submitSkillSubmission,
} from "@/lib/skill-submit"

export const dynamic = "force-dynamic"

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await readRequestJsonBounded(request, 512 * 1024)
  } catch {
    return null
  }
}

export async function POST(request: Request) {
  try {
    const auth = await verifySkillApiKey(request)
    if (!auth) return unauthorized()

    const parsed = skillSubmitRequestSchema.safeParse(await readJson(request))
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body", issues: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    const result = await submitSkillSubmission(auth.accountId, parsed.data)
    if (!result.ok) {
      const response = NextResponse.json(
        {
          error: result.error,
          code: result.code,
          reset: result.reset,
          similarity: result.similarity?.violation,
        },
        { status: result.httpStatus },
      )
      if (result.httpStatus === 429 && result.reset) {
        response.headers.set("Retry-After", String(result.reset))
      }
      return response
    }

    const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin
    return NextResponse.json(
      {
        uuid: result.uuid,
        status: result.status,
        statusUrl: buildSkillStatusUrl(origin, result.uuid, parsed.data.locale),
        review: {
          score: result.reviewScore,
          reasons: result.reviewReasons,
        },
      },
      { status: 201 },
    )
  } catch (error) {
    console.error("[skill-submit] route failed:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
