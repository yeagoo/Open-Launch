/**
 * Generate POOL_SIZE deterministic boring-avatar SVGs into
 * `public/avatars/pool/{0..N-1}.svg`. Idempotent — it verifies the complete
 * numeric set and generates only missing files, so a single sentinel cannot
 * hide a partially copied pool.
 *
 * Run with: bun run scripts/generate-avatar-pool.ts
 */

import { mkdir, readdir, writeFile } from "node:fs/promises"
import { resolve } from "node:path"

import { POOL_SIZE } from "@/lib/avatar-pool"
import { generateAvatarSvg } from "@/lib/boring-avatar"

const POOL_DIR = resolve(process.cwd(), "public", "avatars", "pool")

async function main() {
  await mkdir(POOL_DIR, { recursive: true })

  const existingEntries = await readdir(POOL_DIR, { withFileTypes: true })
  const existingSlots = new Set<number>()
  for (const entry of existingEntries) {
    const match = /^(\d+)\.svg$/.exec(entry.name)
    if (!entry.isFile() || !match) continue
    const slot = Number(match[1])
    if (!Number.isSafeInteger(slot) || slot < 0 || slot >= POOL_SIZE) {
      throw new Error(`Unexpected avatar pool slot: ${entry.name}`)
    }
    existingSlots.add(slot)
  }
  if (existingSlots.size === POOL_SIZE) {
    console.log(`Pool already populated (${POOL_SIZE} files); skipping.`)
    return
  }

  const missingCount = POOL_SIZE - existingSlots.size
  console.log(`Generating ${missingCount} missing pool avatars into ${POOL_DIR} …`)
  let written = 0
  for (let i = 0; i < POOL_SIZE; i++) {
    if (existingSlots.has(i)) continue
    const svg = generateAvatarSvg(`pool-${i}`, 96)
    await writeFile(resolve(POOL_DIR, `${i}.svg`), svg, "utf8")
    written += 1
    if (written % 500 === 0 || written === missingCount) {
      console.log(`  ${written}/${missingCount}`)
    }
  }
  console.log(`✅ done`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
