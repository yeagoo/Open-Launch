/**
 * Boring-avatars helper.
 *
 * Picks one of 6 styles + one of 4 color palettes deterministically from a
 * seed (userId), then server-renders the React component to a static SVG
 * string via react-dom/server.
 *
 * Important: only callable from Node scripts (`scripts/backfill-avatars.ts`).
 * Importing this from a Next.js route handler trips the bundler with
 * "react-dom/server is not supported in React Server Components", and
 * dynamic-import workarounds run into a useId hook mismatch under React 19.
 * A runtime /api/avatars/[seed].svg endpoint was attempted and reverted —
 * see the commit history for the failure mode. Until that pairs cleanly,
 * new signups without a stored image fall back to the initial-letter
 * circle in components.
 */

import { createHash } from "node:crypto"

import { createElement } from "react"

import Avatar from "boring-avatars"
import { renderToString } from "react-dom/server"

const STYLES = ["marble", "beam", "pixel", "sunset", "ring", "bauhaus"] as const

type Variant = (typeof STYLES)[number]

// 4 palettes — deterministically selected per user via seed hash. Tuned to be
// visually distinct from each other so a comment thread feels varied.
const PALETTES: ReadonlyArray<readonly [string, string, string, string, string]> = [
  ["#92A1C6", "#146A7C", "#F0AB3D", "#C271B4", "#C20D90"], // boring-avatars classic
  ["#FFAD08", "#EDD75A", "#73B06F", "#0C8F8F", "#405059"], // warm sunset
  ["#264653", "#2A9D8F", "#E9C46A", "#F4A261", "#E76F51"], // earthy
  ["#FF595E", "#FFCA3A", "#8AC926", "#1982C4", "#6A4C93"], // vivid primary
] as const

// Cheap deterministic hash (DJB2-style). Same seed always returns same number.
function hash(str: string): number {
  let h = 5381
  for (let i = 0; i < str.length; i++) {
    h = (h * 33) ^ str.charCodeAt(i)
  }
  return h >>> 0 // force unsigned
}

export interface AvatarConfig {
  variant: Variant
  palette: string[]
}

/**
 * Pick a (style, palette) pair from the seed. Two independent slices of the
 * hash so style and palette aren't correlated.
 */
export function pickAvatarConfig(seed: string): AvatarConfig {
  const h = hash(seed)
  const variant = STYLES[h % STYLES.length]
  // `>>>` (unsigned) avoids palette index going negative when the high bit of
  // h is set; `>>` would coerce to signed and break for ~half of seeds.
  const palette = PALETTES[(h >>> 8) % PALETTES.length]
  return { variant, palette: [...palette] }
}

/**
 * Opaque, URL-safe filename derived from the userId. Hashing prevents leaking
 * internal IDs — particularly the `bot-user-N` pattern, which would otherwise
 * make every AI commenter trivially identifiable from their avatar URL.
 *
 * 16 hex chars = 64 bits of entropy → collision probability is negligible
 * for any realistic user count.
 */
export function avatarFilename(seed: string): string {
  return createHash("sha256").update(seed).digest("hex").slice(0, 16) + ".svg"
}

/**
 * Render a boring-avatar to a static SVG string. Default size 96 — plenty
 * for the 32x32/40x40 places it gets shown, and avoids visible blur on hi-DPI.
 * Synchronous because the script that calls this runs in plain Node, not
 * inside Next.js's React server-component bundle.
 */
export function generateAvatarSvg(seed: string, size = 96): string {
  const { variant, palette } = pickAvatarConfig(seed)
  return renderToString(
    createElement(Avatar, {
      size,
      name: seed,
      variant,
      colors: palette,
    }),
  )
}
