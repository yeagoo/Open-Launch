import { createHash, timingSafeEqual } from "node:crypto"

import { skillApiKey } from "@/drizzle/db/schema"
import { and, eq, isNull } from "drizzle-orm"

export interface SkillAuthResult {
  accountId: string
}

export interface SkillApiKeyRecord {
  id: string
  accountId: string
  keyHash: string
  revokedAt: Date | null
}

export interface SkillApiKeyStore {
  findByHash(keyHash: string): Promise<SkillApiKeyRecord | null>
  markLastUsed(id: string, usedAt: Date): Promise<boolean>
}

const drizzleSkillApiKeyStore: SkillApiKeyStore = {
  async findByHash(keyHash) {
    const { db } = await import("@/drizzle/db")
    const [row] = await db
      .select({
        id: skillApiKey.id,
        accountId: skillApiKey.accountId,
        keyHash: skillApiKey.keyHash,
        revokedAt: skillApiKey.revokedAt,
      })
      .from(skillApiKey)
      .where(eq(skillApiKey.keyHash, keyHash))
      .limit(1)

    return row ?? null
  },

  async markLastUsed(id, usedAt) {
    const { db } = await import("@/drizzle/db")
    const result = await db
      .update(skillApiKey)
      .set({ lastUsedAt: usedAt })
      .where(and(eq(skillApiKey.id, id), isNull(skillApiKey.revokedAt)))
    return Boolean(result.rowCount && result.rowCount > 0)
  },
}

export function hashSkillApiKey(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex")
}

export async function verifySkillApiKey(
  request: Request,
  store: SkillApiKeyStore = drizzleSkillApiKeyStore,
): Promise<SkillAuthResult | null> {
  const rawKey = extractBearerToken(request)
  if (!rawKey) return null

  const keyHash = hashSkillApiKey(rawKey)
  const row = await store.findByHash(keyHash)
  if (!row || row.revokedAt) return null

  if (!timingSafeHexEqual(row.keyHash, keyHash)) return null

  const stamped = await store.markLastUsed(row.id, new Date())
  if (!stamped) return null

  return { accountId: row.accountId }
}

function extractBearerToken(request: Request): string | null {
  const authHeader = request.headers.get("authorization")
  const match = authHeader?.match(/^Bearer\s+(.+)$/i)
  const token = match?.[1]?.trim()
  return token || null
}

function timingSafeHexEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "hex")
  const right = Buffer.from(b, "hex")
  return left.length === right.length && timingSafeEqual(left, right)
}
