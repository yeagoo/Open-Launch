import "server-only"

import { createHash } from "node:crypto"

import { z } from "zod"

import { CommunityError } from "./contracts"

const cursorSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("date"),
      date: z.string().datetime(),
      id: z.string().uuid(),
      scope: z.string().length(64),
    })
    .strict(),
  z
    .object({
      kind: z.literal("hot"),
      snapshot: z.string().regex(/^hot-\d+$/),
      position: z.number().int().min(1).max(2000),
      scope: z.string().length(64),
    })
    .strict(),
])
export type CommunityCursor = z.infer<typeof cursorSchema>
export const scopeHash = (input: unknown) =>
  createHash("sha256").update(JSON.stringify(input)).digest("hex")
export const encodeCursor = (cursor: CommunityCursor) =>
  Buffer.from(JSON.stringify(cursor)).toString("base64url")
export function decodeCursor(value: string | undefined, scope: string): CommunityCursor | null {
  if (!value) return null
  if (value.length > 1600) throw new CommunityError("validation", "Invalid cursor")
  try {
    const cursor = cursorSchema.parse(JSON.parse(Buffer.from(value, "base64url").toString()))
    if (cursor.scope !== scope) throw new Error()
    return cursor
  } catch {
    throw new CommunityError("validation", "This cursor does not belong to the current view")
  }
}
