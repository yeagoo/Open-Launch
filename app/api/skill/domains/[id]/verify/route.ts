import { NextResponse } from "next/server"

import { db } from "@/drizzle/db"
import { verifiedDomain } from "@/drizzle/db/schema"
import { and, eq } from "drizzle-orm"
import * as z from "zod"

import { checkRateLimit } from "@/lib/rate-limit"
import { verifySkillApiKey } from "@/lib/skill-auth"
import { verifySkillDomainProof } from "@/lib/skill-domain-verify"
import { buildSkillDomainMethods, type SkillDomainMethod } from "@/lib/skill-domains"

const VERIFY_RATE_LIMIT = {
  attempts: 10,
  windowMs: 60 * 1000,
}

const paramsSchema = z.object({
  id: z.string().uuid(),
})

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
}

function serializeDomain(row: typeof verifiedDomain.$inferSelect) {
  return {
    id: row.id,
    domain: row.domain,
    method: row.method as SkillDomainMethod,
    token: row.token,
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    methods: buildSkillDomainMethods(row.domain, row.token),
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await verifySkillApiKey(request)
    if (!auth) return unauthorized()

    const parsedParams = paramsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Invalid domain id" }, { status: 400 })
    }

    const [row] = await db
      .select()
      .from(verifiedDomain)
      .where(
        and(
          eq(verifiedDomain.id, parsedParams.data.id),
          eq(verifiedDomain.accountId, auth.accountId),
        ),
      )
      .limit(1)

    if (!row) {
      return NextResponse.json({ error: "Domain not found" }, { status: 404 })
    }

    if (row.verifiedAt) {
      return NextResponse.json({ verified: true, domain: serializeDomain(row) })
    }

    const rateLimit = await checkRateLimit(
      `skill-domain-verify:${auth.accountId}`,
      VERIFY_RATE_LIMIT.attempts,
      VERIFY_RATE_LIMIT.windowMs,
      { onRedisError: "fail-closed" },
    )
    if (!rateLimit.success) {
      return NextResponse.json(
        {
          error: "Too many verification attempts. Please try again later.",
          reset: rateLimit.reset,
        },
        { status: 429 },
      )
    }

    const result = await verifySkillDomainProof(row)
    if (!result.verified) {
      console.info("[skill-domains] domain verification failed:", {
        domainId: row.id,
        domain: row.domain,
        method: row.method,
        reason: result.reason ?? "unknown",
      })
      return NextResponse.json({
        verified: false,
        reason: "Verification proof was not found or did not match.",
        domain: serializeDomain(row),
      })
    }

    const now = new Date()
    const [updated] = await db
      .update(verifiedDomain)
      .set({ verifiedAt: now })
      .where(and(eq(verifiedDomain.id, row.id), eq(verifiedDomain.accountId, auth.accountId)))
      .returning()

    return NextResponse.json(
      {
        verified: true,
        domain: serializeDomain(updated ?? { ...row, verifiedAt: now }),
      },
      { status: 200 },
    )
  } catch (error) {
    console.error("[skill-domains] verify failed:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
