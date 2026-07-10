import { NextResponse } from "next/server"

import { db } from "@/drizzle/db"
import { verifiedDomain } from "@/drizzle/db/schema"
import { and, desc, eq, isNull } from "drizzle-orm"

import { countInt } from "@/lib/db-utils"
import { checkRateLimit } from "@/lib/rate-limit"
import { readRequestJsonBounded } from "@/lib/read-request-body"
import { verifySkillApiKey } from "@/lib/skill-auth"
import {
  buildSkillDomainMethods,
  createSkillDomainToken,
  normalizeSkillDomain,
  registerSkillDomainSchema,
  type SkillDomainMethod,
} from "@/lib/skill-domains"

type VerifiedDomainRow = typeof verifiedDomain.$inferSelect

const DOMAIN_REGISTRATION_RATE_LIMIT = {
  attempts: 30,
  windowMs: 60 * 1000,
}
const MAX_DOMAINS_PER_ACCOUNT = 50

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
}

function serializeDomain(row: VerifiedDomainRow) {
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

async function readJson(request: Request): Promise<unknown> {
  try {
    return await readRequestJsonBounded(request, 16 * 1024)
  } catch {
    return null
  }
}

export async function GET(request: Request) {
  try {
    const auth = await verifySkillApiKey(request)
    if (!auth) return unauthorized()

    const rows = await db
      .select()
      .from(verifiedDomain)
      .where(eq(verifiedDomain.accountId, auth.accountId))
      .orderBy(desc(verifiedDomain.createdAt))

    return NextResponse.json({ domains: rows.map(serializeDomain) })
  } catch (error) {
    console.error("[skill-domains] list failed:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const auth = await verifySkillApiKey(request)
    if (!auth) return unauthorized()

    const parsed = registerSkillDomainSchema.safeParse(await readJson(request))
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body", issues: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    const domain = normalizeSkillDomain(parsed.data.domain)
    if (!domain) {
      return NextResponse.json({ error: "Invalid domain" }, { status: 400 })
    }

    const rateLimit = await checkRateLimit(
      `skill-domain-register:${auth.accountId}`,
      DOMAIN_REGISTRATION_RATE_LIMIT.attempts,
      DOMAIN_REGISTRATION_RATE_LIMIT.windowMs,
      { onRedisError: "fail-closed" },
    )
    if (!rateLimit.success) {
      return NextResponse.json(
        {
          error: "Too many domain registration attempts. Please try again later.",
          reset: rateLimit.reset,
        },
        { status: 429 },
      )
    }

    const existing = await findAccountDomain(auth.accountId, domain)
    if (existing) {
      if (existing.verifiedAt || existing.method === parsed.data.method) {
        return NextResponse.json({ domain: serializeDomain(existing), created: false })
      }

      const [updated] = await db
        .update(verifiedDomain)
        .set({
          method: parsed.data.method,
          token: createSkillDomainToken(),
        })
        .where(
          and(
            eq(verifiedDomain.id, existing.id),
            eq(verifiedDomain.accountId, auth.accountId),
            isNull(verifiedDomain.verifiedAt),
          ),
        )
        .returning()

      return NextResponse.json({
        domain: serializeDomain(
          updated ?? (await findAccountDomainOrThrow(auth.accountId, domain)),
        ),
        created: false,
      })
    }

    const domainCount = await countAccountDomains(auth.accountId)
    if (domainCount >= MAX_DOMAINS_PER_ACCOUNT) {
      return NextResponse.json(
        {
          error: `Domain registration limit reached (${MAX_DOMAINS_PER_ACCOUNT} per account).`,
        },
        { status: 409 },
      )
    }

    const [created] = await db
      .insert(verifiedDomain)
      .values({
        accountId: auth.accountId,
        domain,
        method: parsed.data.method,
        token: createSkillDomainToken(),
      })
      .onConflictDoNothing()
      .returning()

    return NextResponse.json(
      {
        domain: serializeDomain(
          created ?? (await findAccountDomainOrThrow(auth.accountId, domain)),
        ),
        created: Boolean(created),
      },
      { status: created ? 201 : 200 },
    )
  } catch (error) {
    console.error("[skill-domains] register failed:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

async function findAccountDomain(
  accountId: string,
  domain: string,
): Promise<VerifiedDomainRow | null> {
  const [row] = await db
    .select()
    .from(verifiedDomain)
    .where(and(eq(verifiedDomain.accountId, accountId), eq(verifiedDomain.domain, domain)))
    .limit(1)

  return row ?? null
}

async function countAccountDomains(accountId: string): Promise<number> {
  const [row] = await db
    .select({ total: countInt() })
    .from(verifiedDomain)
    .where(eq(verifiedDomain.accountId, accountId))

  return row?.total ?? 0
}

async function findAccountDomainOrThrow(
  accountId: string,
  domain: string,
): Promise<VerifiedDomainRow> {
  const row = await findAccountDomain(accountId, domain)
  if (!row) {
    throw new Error(`verified_domain missing after insert conflict: ${accountId} ${domain}`)
  }
  return row
}
