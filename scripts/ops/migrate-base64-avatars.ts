#!/usr/bin/env bun
import { db } from "@/drizzle/db"
import { user } from "@/drizzle/db/schema"
import { and, count, eq, gt, like, sql } from "drizzle-orm"
import sharp from "sharp"

import { uploadFileToR2 } from "@/lib/r2-client"

const execute = process.argv.includes("--execute")
const MAX_DECODED_BYTES = 20 * 1024 * 1024
// Legacy profile photos include a small number of 24.5 MP phone images.
// Keep the cap just above that observed maximum while remaining well within
// the 768 MiB operations-container limit (about 100 MiB decoded RGBA).
const MAX_INPUT_PIXELS = 25_000_000
const BATCH_SIZE = 25

function decodeImageDataUrl(value: string): Buffer {
  const match = /^data:image\/(?:jpeg|png|webp|gif|avif);base64,([a-zA-Z0-9+/=\s]+)$/.exec(value)
  if (!match) throw new Error("unsupported data URL")
  const buffer = Buffer.from(match[1], "base64")
  if (!buffer.length || buffer.length > MAX_DECODED_BYTES) {
    throw new Error("decoded avatar exceeds migration limit")
  }
  return buffer
}

async function main() {
  if (!execute) {
    const [summary] = await db
      .select({
        count: count(),
        encodedBytes: sql<number>`coalesce(sum(length(${user.image})), 0)`.mapWith(Number),
      })
      .from(user)
      .where(like(user.image, "data:image/%"))
    console.log(
      `[migrate-base64-avatars] dry-run: ${summary?.count ?? 0} avatars, ${summary?.encodedBytes ?? 0} encoded bytes`,
    )
    console.log("[migrate-base64-avatars] rerun with --execute to upload and replace them")
    return
  }

  let cursor = ""
  let migrated = 0
  let skipped = 0
  let failed = 0

  while (true) {
    const rows = await db
      .select({ id: user.id, image: user.image })
      .from(user)
      .where(and(like(user.image, "data:image/%"), gt(user.id, cursor)))
      .orderBy(user.id)
      .limit(BATCH_SIZE)
    if (rows.length === 0) break

    for (const row of rows) {
      cursor = row.id
      if (!row.image) continue
      try {
        const input = decodeImageDataUrl(row.image)
        const output = await sharp(input, {
          failOn: "error",
          limitInputPixels: MAX_INPUT_PIXELS,
        })
          .rotate()
          .resize({ width: 512, height: 512, fit: "inside", withoutEnlargement: true })
          .avif({ quality: 82, effort: 6 })
          .toBuffer()
        const imageUrl = await uploadFileToR2(
          output,
          "migrated-avatar.avif",
          "image/avif",
          "avatars",
        )
        const updated = await db
          .update(user)
          .set({ image: imageUrl, updatedAt: new Date() })
          .where(and(eq(user.id, row.id), eq(user.image, row.image)))
          .returning({ id: user.id })
        if (updated.length === 1) migrated++
        else skipped++
      } catch (error) {
        failed++
        console.error(
          `[migrate-base64-avatars] failed user ${row.id.slice(0, 8)}:`,
          error instanceof Error ? error.message : "unknown error",
        )
      }
    }
  }

  console.log(
    `[migrate-base64-avatars] migrated=${migrated} skipped_concurrent=${skipped} failed=${failed}`,
  )
  if (failed > 0) process.exitCode = 1
}

main().catch((error) => {
  console.error("[migrate-base64-avatars]", error)
  process.exit(1)
})
