/**
 * One-shot: assign a deterministic boring-avatars SVG to every user that has
 * no image set (bots + any real user without an OAuth photo). Writes one SVG
 * file per user under `public/avatars/${userId}.svg` and updates `user.image`
 * to point at it.
 *
 * Run with: bun run scripts/backfill-avatars.ts
 */

import { mkdir, writeFile } from "node:fs/promises"
import { resolve } from "node:path"

import { db } from "@/drizzle/db"
import { user } from "@/drizzle/db/schema"
import { eq, isNull } from "drizzle-orm"

import { generateAvatarSvg } from "@/lib/boring-avatar"

const PUBLIC_AVATARS_DIR = resolve(process.cwd(), "public", "avatars")

// User IDs are written verbatim into a filesystem path. Reject anything that
// could escape the directory or break the URL.
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/

async function main() {
  await mkdir(PUBLIC_AVATARS_DIR, { recursive: true })

  const users = await db.select({ id: user.id }).from(user).where(isNull(user.image))
  console.log(`Found ${users.length} users without an avatar`)

  let written = 0
  let skipped = 0
  const skippedIds: string[] = []

  for (const { id } of users) {
    if (!SAFE_ID.test(id)) {
      skipped++
      skippedIds.push(id)
      continue
    }
    const svg = generateAvatarSvg(id, 96)
    const filePath = resolve(PUBLIC_AVATARS_DIR, `${id}.svg`)
    await writeFile(filePath, svg, "utf8")
    await db
      .update(user)
      .set({ image: `/avatars/${id}.svg` })
      .where(eq(user.id, id))
    written++
    if (written % 25 === 0) console.log(`  ${written}/${users.length}`)
  }

  console.log(`✅ wrote ${written} avatars`)
  if (skipped > 0) {
    console.log(`⚠️  skipped ${skipped} users with non-safe IDs:`)
    console.log(`   ${skippedIds.slice(0, 5).join(", ")}${skippedIds.length > 5 ? "…" : ""}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
