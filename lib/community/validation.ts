import { z } from "zod"

import { CommunityError, postTypes } from "./contracts"
import { communityIdPattern } from "./id"

// Keep the service and Proxy on the same UUID wire format. The message matches
// Zod's built-in `uuid()` message, which is exposed through `parseInput`.
export const idSchema = z.string().regex(communityIdPattern, "Invalid uuid")
export const requestKeySchema = z
  .string()
  .min(8)
  .max(100)
  .regex(/^[a-zA-Z0-9:_-]+$/)
const safeText = (max: number) =>
  z
    .string()
    .max(max)
    .refine((value) => !value.includes("\0"), "Null characters are not supported")
export const draftSchema = z
  .object({
    title: safeText(160),
    body: safeText(10000),
    type: z.enum(postTypes),
    productId: safeText(200),
  })
  .strict()
export const publishSchema = draftSchema.refine(
  (value) => value.body.trim().length >= 20,
  "Write at least 20 characters of context",
)
export const replySchema = safeText(4000).refine((value) => value.trim().length > 0)
export const reasonSchema = safeText(1000).refine((value) => value.trim().length >= 10)
export const versionSchema = z.number().int().positive()
export const querySchema = z
  .object({
    view: z.enum(["all", "mine", "saved"]),
    type: z.enum(["All", ...postTypes]),
    sort: z.enum(["Latest", "Hot"]),
    search: safeText(200),
    cursor: z.string().max(1600).optional(),
  })
  .strict()
  .refine(
    (value) => !value.search.trim() || value.search.trim().length >= 3,
    "Use at least 3 characters to search community posts",
  )
export function parseInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input)
  if (!parsed.success)
    throw new CommunityError(
      "validation",
      parsed.error.issues[0]?.message ?? "Invalid community input",
    )
  return parsed.data
}
