"use server"

import { randomBytes } from "node:crypto"

import { revalidatePath } from "next/cache"
import { headers } from "next/headers"

import { db } from "@/drizzle/db"
import { skillApiKey } from "@/drizzle/db/schema"
import { and, desc, eq, isNull } from "drizzle-orm"
import * as z from "zod"

import { auth } from "@/lib/auth"
import { hashSkillApiKey } from "@/lib/skill-auth"

const skillApiKeyLabelSchema = z.string().trim().min(1).max(80)
const skillApiKeyIdSchema = z.string().uuid()

export interface SkillApiKeyListItem {
  id: string
  label: string
  keyPrefix: string
  createdAt: string
  lastUsedAt: string | null
  revokedAt: string | null
}

export interface CreatedSkillApiKey {
  key: SkillApiKeyListItem
  rawKey: string
}

async function requireUserId(): Promise<string> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) {
    throw new Error("Unauthorized")
  }
  return session.user.id
}

function serializeSkillApiKey(row: {
  id: string
  label: string
  keyPrefix: string
  createdAt: Date
  lastUsedAt: Date | null
  revokedAt: Date | null
}): SkillApiKeyListItem {
  return {
    id: row.id,
    label: row.label,
    keyPrefix: row.keyPrefix,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
  }
}

function generateSkillApiKey(): { rawKey: string; keyPrefix: string; keyHash: string } {
  const rawKey = `aat_skill_${randomBytes(32).toString("base64url")}`
  return {
    rawKey,
    keyPrefix: rawKey.slice(0, 18),
    keyHash: hashSkillApiKey(rawKey),
  }
}

export async function listSkillApiKeys(): Promise<SkillApiKeyListItem[]> {
  const accountId = await requireUserId()
  const rows = await db
    .select({
      id: skillApiKey.id,
      label: skillApiKey.label,
      keyPrefix: skillApiKey.keyPrefix,
      createdAt: skillApiKey.createdAt,
      lastUsedAt: skillApiKey.lastUsedAt,
      revokedAt: skillApiKey.revokedAt,
    })
    .from(skillApiKey)
    .where(eq(skillApiKey.accountId, accountId))
    .orderBy(desc(skillApiKey.createdAt))

  return rows.map(serializeSkillApiKey)
}

export async function createSkillApiKey(label: string): Promise<CreatedSkillApiKey> {
  const accountId = await requireUserId()
  const parsedLabel = skillApiKeyLabelSchema.safeParse(label)
  if (!parsedLabel.success) {
    throw new Error("API key label must be 1-80 characters.")
  }

  const generated = generateSkillApiKey()
  const [row] = await db
    .insert(skillApiKey)
    .values({
      accountId,
      keyHash: generated.keyHash,
      keyPrefix: generated.keyPrefix,
      label: parsedLabel.data,
    })
    .returning({
      id: skillApiKey.id,
      label: skillApiKey.label,
      keyPrefix: skillApiKey.keyPrefix,
      createdAt: skillApiKey.createdAt,
      lastUsedAt: skillApiKey.lastUsedAt,
      revokedAt: skillApiKey.revokedAt,
    })

  revalidatePath("/dashboard")

  return {
    key: serializeSkillApiKey(row),
    rawKey: generated.rawKey,
  }
}

export async function revokeSkillApiKey(id: string): Promise<void> {
  const accountId = await requireUserId()
  const parsedId = skillApiKeyIdSchema.safeParse(id)
  if (!parsedId.success) {
    throw new Error("Invalid API key id.")
  }

  const now = new Date()
  await db
    .update(skillApiKey)
    .set({ revokedAt: now })
    .where(
      and(
        eq(skillApiKey.id, parsedId.data),
        eq(skillApiKey.accountId, accountId),
        isNull(skillApiKey.revokedAt),
      ),
    )

  revalidatePath("/dashboard")
}
