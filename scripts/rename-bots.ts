/**
 * Rename existing bot users (`is_bot = true`) from corporate "First Last"
 * style to internet-handle style. Same user.id stays — only `name` changes,
 * so the avatar URL (hashed from id) is unaffected and existing comments
 * retain their author link.
 *
 * Run with: bun run scripts/rename-bots.ts
 */

import { db } from "@/drizzle/db"
import { user } from "@/drizzle/db/schema"
import { asc, eq } from "drizzle-orm"

// 80 handles — mix of Western, abstract, Asian-flavored, with various
// conventions (lowercase, snake_case, dot.case, leetspeak, numbers).
const HANDLES = [
  "pixelpunk",
  "code_witch",
  "ghostbyte",
  "neon_dev",
  "sandbyte",
  "sleepyfox",
  "tako_98",
  "dev_404",
  "modemfox",
  "byteforge",
  "async_bean",
  "moonbyte",
  "starpilot",
  "leafpup",
  "ramen_dev",
  "async_witch",
  "terminal_cat",
  "vim_panda",
  "debug_dad",
  "kbd_kit",
  "mech_mouse",
  "yoyo_dev",
  "mocha_byte",
  "gizmo_98",
  "pixel_pilot",
  "syntaxsaint",
  "qa_quokka",
  "wave_2k",
  "latte_logic",
  "fox_async",
  "cone_dev",
  "neonkit",
  "blip_dev",
  "async_apple",
  "thoth_dev",
  "indie_inkwell",
  "devtangerine",
  "cobra_keys",
  "owlcity_dev",
  "c0deworm",
  "pixelraccoon",
  "coderust",
  "sandybyte",
  "pingu_t",
  "meowbyte",
  "blueprint_b",
  "soju_dev",
  "makibyte",
  "mintcoder",
  "vsync_kev",
  "latency_lin",
  "debug_dao",
  "prng_pup",
  "kawaii_kit",
  "pavlov_dev",
  "rusty_robin",
  "ninty_dev",
  "spec_zero",
  "void_pug",
  "dev_wakaru",
  "sushi_qa",
  "async_aurora",
  "scrappy_dev",
  "byte_safari",
  "mocha_ops",
  "retro_kit",
  "cosmic_kit",
  "kettle_dev",
  "tiny_oracle",
  "glitch_pup",
  "twitch_dev",
  "hopeful_404",
  "modem_yoshi",
  "dev_wabisabi",
  "lazy_async",
  "parade_kit",
  "slow_byte",
  "hello_404",
  "late_compile",
  "calm_kit",
]

async function main() {
  const bots = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.isBot, true))
    .orderBy(asc(user.id))

  console.log(`Found ${bots.length} bots, have ${HANDLES.length} handles`)

  if (bots.length === 0) return

  let updated = 0
  for (let i = 0; i < bots.length; i++) {
    const handle = HANDLES[i % HANDLES.length]
    await db.update(user).set({ name: handle }).where(eq(user.id, bots[i].id))
    updated++
    if (updated % 20 === 0) console.log(`  ${updated}/${bots.length}`)
  }
  console.log(`✅ renamed ${updated} bots`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
