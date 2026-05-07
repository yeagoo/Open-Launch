/**
 * Assign a deterministic boring-avatars SVG to every user that:
 *   (a) has no image at all, OR
 *   (b) currently points at a /avatars/* URL using their raw userId as the
 *       filename (the previous, leaky scheme — bot-user-N.svg etc.).
 *
 * The new scheme hashes the userId so URLs reveal nothing about whether the
 * account is a bot. Existing OAuth photos (Google/GitHub URLs) are left
 * untouched.
 *
 * Run with: bun run scripts/backfill-avatars.ts
 */

import { mkdir, writeFile } from "node:fs/promises"
import { resolve } from "node:path"

import { db } from "@/drizzle/db"
import { user } from "@/drizzle/db/schema"
import { eq, isNull, or, sql } from "drizzle-orm"

import { avatarFilename, generateAvatarSvg } from "@/lib/boring-avatar"

const PUBLIC_AVATARS_DIR = resolve(process.cwd(), "public", "avatars")

async function main() {
  await mkdir(PUBLIC_AVATARS_DIR, { recursive: true })

  // Pull anyone whose image is NULL or already points at a locally-hosted
  // avatar (we want to regenerate those with the new hashed filename).
  const users = await db
    .select({ id: user.id })
    .from(user)
    .where(or(isNull(user.image), sql`${user.image} LIKE '/avatars/%'`))

  console.log(`Found ${users.length} users to (re)generate avatars for`)

  let written = 0
  for (const { id } of users) {
    const filename = avatarFilename(id)
    const svg = generateAvatarSvg(id, 96)
    await writeFile(resolve(PUBLIC_AVATARS_DIR, filename), svg, "utf8")
    await db
      .update(user)
      .set({ image: `/avatars/${filename}` })
      .where(eq(user.id, id))
    written++
    if (written % 25 === 0) console.log(`  ${written}/${users.length}`)
  }

  console.log(`✅ wrote ${written} avatars`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
