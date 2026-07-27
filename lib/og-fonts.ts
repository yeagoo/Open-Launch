/**
 * Shared fonts for next/og (ImageResponse) OG image generation.
 *
 * Satori requires explicit TTF files — there is no system font discovery.
 * Files live in assets/fonts/ and MUST be traced into the standalone
 * build (see outputFileTracingIncludes in next.config.ts), or the
 * production container crashes with ENOENT here.
 *
 * Inter covers Latin; Noto Sans SC (full glyph set, NOT a subset —
 * project names are runtime user text) covers CJK. Satori falls back
 * through the array per glyph.
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"

export interface OgFont {
  name: string
  data: Buffer
  weight: 700
  style: "normal"
}

let cached: OgFont[] | null = null

export function getOgFonts(): OgFont[] {
  if (!cached) {
    const dir = join(process.cwd(), "assets", "fonts")
    cached = [
      {
        name: "Inter",
        data: readFileSync(join(dir, "Inter-Bold.ttf")),
        weight: 700,
        style: "normal",
      },
      {
        name: "Noto Sans SC",
        data: readFileSync(join(dir, "NotoSansSC-Bold.ttf")),
        weight: 700,
        style: "normal",
      },
    ]
  }
  return cached
}
