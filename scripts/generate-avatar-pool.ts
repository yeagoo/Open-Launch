/**
 * Generate POOL_SIZE deterministic boring-avatar SVGs into
 * `public/avatars/pool/{0..N-1}.svg`. Idempotent — if the last expected
 * file already exists, the script exits without rewriting anything, so it's
 * safe to wire into a build hook.
 *
 * Run with: bun run scripts/generate-avatar-pool.ts
 */

import { existsSync } from "node:fs"
import { mkdir, writeFile } from "node:fs/promises"
import { resolve } from "node:path"

import { POOL_SIZE } from "@/lib/avatar-pool"
import { generateAvatarSvg } from "@/lib/boring-avatar"

const POOL_DIR = resolve(process.cwd(), "public", "avatars", "pool")

async function main() {
  await mkdir(POOL_DIR, { recursive: true })

  const sentinel = resolve(POOL_DIR, `${POOL_SIZE - 1}.svg`)
  if (existsSync(sentinel)) {
    console.log(`Pool already populated (${POOL_SIZE} files); skipping.`)
    return
  }

  console.log(`Generating ${POOL_SIZE} pool avatars into ${POOL_DIR} …`)
  for (let i = 0; i < POOL_SIZE; i++) {
    const svg = generateAvatarSvg(`pool-${i}`, 96)
    await writeFile(resolve(POOL_DIR, `${i}.svg`), svg, "utf8")
    if ((i + 1) % 500 === 0) console.log(`  ${i + 1}/${POOL_SIZE}`)
  }
  console.log(`✅ done`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
