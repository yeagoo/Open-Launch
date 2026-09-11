#!/usr/bin/env bun
/**
 * Score the logos on the home hero's launch wall.
 *
 * The wall is decorative texture made of real product logos, and it only looks
 * deliberate if the marks in it behave the same way. Two kinds of asset break
 * that:
 *
 *   - A **full-bleed coloured square** (an icon exported with its own背景) fills
 *     the whole cell, so a wall of them reads as a patchwork of pastel blocks
 *     rather than a wall of products.
 *   - A **wide wordmark** letterboxes inside a square cell and turns to noise at
 *     40px, as does any raster too small to survive a 2x or 3x display.
 *
 * None of that is knowable from `logo_url`, and `project` has no metadata
 * columns, so this script measures the assets themselves and writes the result
 * to `lib/logo-wall-quality.json`, which the hero reads. Re-run it when logos
 * change:
 *
 *   bun run logos:audit --dir <dir>            # score every file in a directory
 *   bun run logos:audit --dir <dir> --write    # ...and update the manifest
 *
 * The wall prefers rated marks that `floating`, and falls back to showing
 * whatever it has when too few qualify — which is what keeps a fresh local
 * fixture (whose logos are generated, and therefore unrated) from rendering an
 * empty hero.
 */
import { readdir, readFile, writeFile } from "node:fs/promises"
import { basename, join, resolve } from "node:path"

import sharp from "sharp"

/** Minimum raster edge that still looks sharp at 40px on a 3x display. */
const MIN_EDGE = 120
/** Square enough to sit in a square cell without letterboxing. */
const MIN_RATIO = 0.8
const MAX_RATIO = 1.25
export interface LogoQuality {
  width: number
  height: number
  ratio: number
  hasAlpha: boolean
  /** Fraction of pixels that are fully transparent. */
  transparentShare: number
  /** True when all four corners are transparent — a floating mark, not a tile. */
  floating: boolean
  /** Aspect ratio of the visible content, not the canvas. A wordmark's ink is a
   *  wide bar (often 3:1) even when the canvas is square, and at 40px it turns
   *  to noise; an icon's ink is near 1:1. */
  inkRatio: number
  /** Share of the canvas the visible content occupies. */
  inkShare: number
  /** 0-100. Higher is a better wall tile. */
  score: number
}

export async function scoreLogo(input: Buffer | string): Promise<LogoQuality> {
  const image = sharp(input)
  const meta = await image.metadata()
  const width = meta.width ?? 0
  const height = meta.height ?? 0
  const ratio = height > 0 ? width / height : 0

  // Shrink before reading pixels: the share of transparent area and the corner
  // test are scale-invariant, and a 24x24 read is two orders of magnitude
  // cheaper than a 1024x1024 one.
  const SAMPLE = 24
  const { data, info } = await sharp(input)
    .resize(SAMPLE, SAMPLE, { fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const pixels = info.width * info.height
  let clear = 0
  for (let i = 3; i < data.length; i += 4) if (data[i] === 0) clear += 1
  const transparentShare = pixels > 0 ? clear / pixels : 0

  // Ink bounding box: where the visible pixels actually are.
  let minX = info.width
  let minY = info.height
  let maxX = -1
  let maxY = -1
  let ink = 0
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (data[(y * info.width + x) * 4 + 3] > 8) {
        ink += 1
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  const inkW = maxX >= minX ? maxX - minX + 1 : 0
  const inkH = maxY >= minY ? maxY - minY + 1 : 0
  const inkRatio = inkH > 0 ? inkW / inkH : 0
  const inkShare = pixels > 0 ? ink / pixels : 0

  const alphaAt = (x: number, y: number) => data[(y * info.width + x) * 4 + 3] === 0
  const floating =
    meta.hasAlpha === true &&
    alphaAt(0, 0) &&
    alphaAt(info.width - 1, 0) &&
    alphaAt(0, info.height - 1) &&
    alphaAt(info.width - 1, info.height - 1)

  const square = ratio >= MIN_RATIO && ratio <= MAX_RATIO
  const bigEnough = Math.min(width, height) >= MIN_EDGE
  const big = Math.min(width, height) >= 256

  // Weighted so the two properties that actually change how the wall reads —
  // a floating mark and a square canvas — dominate.
  // A wordmark is wide ink on a square canvas: readable as a brand, noise at
  // 40px. Icons stay near 1:1.
  const iconLike = inkRatio > 0 && inkRatio <= 1.6

  let score = 0
  if (floating) score += 40
  if (square) score += 20
  if (bigEnough) score += 12
  if (big) score += 4
  if (iconLike) score += 18
  score += Math.min(6, Math.round(transparentShare * 15))

  return {
    width,
    height,
    ratio: Number(ratio.toFixed(3)),
    hasAlpha: meta.hasAlpha === true,
    transparentShare: Number(transparentShare.toFixed(3)),
    floating,
    inkRatio: Number(inkRatio.toFixed(3)),
    inkShare: Number(inkShare.toFixed(3)),
    score: bigEnough && square && iconLike ? score : Math.min(score, 40),
  }
}

async function main() {
  const args = process.argv.slice(2)
  const dirIndex = args.indexOf("--dir")
  if (dirIndex === -1 || !args[dirIndex + 1]) {
    console.error("usage: bun scripts/audit-logo-wall.ts --dir <dir> [--write] [--urls <file>]")
    process.exit(2)
  }
  const dir = resolve(args[dirIndex + 1])
  const shouldWrite = args.includes("--write")
  const urlsIndex = args.indexOf("--urls")
  const urlsFile = urlsIndex === -1 ? null : resolve(args[urlsIndex + 1])

  // Files are numbered in the same order as the URL list, so position is the
  // join key rather than a hashed filename.
  let urls: string[] = []
  if (urlsFile) {
    urls = (await readFile(urlsFile, "utf8"))
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
  }

  const files = (await readdir(dir)).filter((f) => !f.startsWith(".")).sort()
  const rows: { file: string; url: string | null; quality: LogoQuality }[] = []

  for (const [index, file] of files.entries()) {
    try {
      const quality = await scoreLogo(join(dir, file))
      rows.push({ file, url: urls[index] ?? null, quality })
    } catch (error) {
      console.error(`  ! ${file}: ${(error as Error).message}`)
    }
  }

  rows.sort((a, b) => b.quality.score - a.quality.score)
  console.log("  score  float square icon   size      ratio    ink  file")
  for (const row of rows) {
    const q = row.quality
    console.log(
      `  ${String(q.score).padStart(5)}  ${q.floating ? "yes  " : "no   "} ${q.width >= MIN_EDGE && q.ratio >= MIN_RATIO && q.ratio <= MAX_RATIO ? "yes   " : "no    "} ${q.inkRatio <= 1.6 ? "yes  " : "no   "} ${String(q.width).padStart(4)}x${String(q.height).padEnd(4)} ${String(q.ratio).padStart(5)} ${String(q.inkRatio).padStart(6)}  ${basename(row.file)}`,
    )
  }

  const good = rows.filter((r) => r.quality.score >= 60)
  console.log(`\n  ${good.length}/${rows.length} score >= 60 (wall-eligible)`)

  if (shouldWrite) {
    const missing = rows.filter((r) => !r.url)
    if (missing.length) {
      console.error(`\n  refusing to write: ${missing.length} file(s) have no URL; pass --urls`)
      process.exit(1)
    }
    const manifest: Record<string, LogoQuality> = {}
    for (const row of rows) manifest[row.url as string] = row.quality
    const out = resolve("lib/logo-wall-quality.json")
    await writeFile(out, `${JSON.stringify(manifest, null, 2)}\n`)
    console.log(`  wrote ${Object.keys(manifest).length} entries to ${out}`)
  }
}

if (import.meta.main) await main()
