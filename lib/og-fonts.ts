/**
 * Shared fonts for next/og (ImageResponse) OG image generation.
 *
 * Inter covers the supported Latin locales and common symbols. Noto Sans SC
 * is split into WOFF shards because Satori does not support WOFF2 and loading
 * the former 10.5 MiB TTF for every request was expensive. Only shards needed
 * by the displayed text are read and cached.
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"

import shardManifestJson from "@/assets/fonts/noto-sans-sc-bold-shards/manifest.json"

export interface OgFont {
  name: string
  data: Buffer
  weight: 700
  style: "normal"
}

export interface OgFontConfig {
  fonts: OgFont[]
  fontFamily: string
}

type CoverageRange = [number, number]

type FontShard = {
  start: number
  end: number
  fontName: string
  file: string
  bytes: number
  sha256: string
}

type FontShardManifest = {
  version: number
  generator: { pageSize: number }
  interCoverageRanges: number[][]
  shards: FontShard[]
}

const shardManifest = shardManifestJson as unknown as FontShardManifest
const shardFilenamePattern = /^[0-9a-f]{6}-[0-9a-f]{6}\.woff$/
const fontDirectory = join(process.cwd(), "assets", "fonts")
const shardDirectory = join(fontDirectory, "noto-sans-sc-bold-shards")
const shardByPage = new Map<number, FontShard>()
const shardBufferCache = new Map<string, Buffer>()
let interBuffer: Buffer | null = null

if (
  shardManifest.version !== 1 ||
  !Number.isSafeInteger(shardManifest.generator.pageSize) ||
  shardManifest.generator.pageSize <= 0 ||
  !Array.isArray(shardManifest.interCoverageRanges) ||
  !shardManifest.interCoverageRanges.every(
    (range) =>
      range.length === 2 &&
      range.every((value) => Number.isSafeInteger(value) && value >= 0) &&
      range[0] <= range[1],
  )
) {
  throw new Error("Unsupported OG font shard manifest")
}

const interCoverageRanges = shardManifest.interCoverageRanges as CoverageRange[]

for (const [index, range] of interCoverageRanges.entries()) {
  if (index > 0 && range[0] <= interCoverageRanges[index - 1][1]) {
    throw new Error("OG font Inter coverage ranges must be sorted and non-overlapping")
  }
}

for (const shard of shardManifest.shards) {
  if (
    !Number.isSafeInteger(shard.start) ||
    !Number.isSafeInteger(shard.end) ||
    shard.start < 0 ||
    shard.end < shard.start ||
    shard.start % shardManifest.generator.pageSize !== 0 ||
    shard.end !== shard.start + shardManifest.generator.pageSize - 1 ||
    !shardFilenamePattern.test(shard.file) ||
    shard.file !==
      `${shard.start.toString(16).padStart(6, "0")}-${shard.end
        .toString(16)
        .padStart(6, "0")}.woff` ||
    !shard.fontName.startsWith("Noto Sans SC ")
  ) {
    throw new Error("Invalid OG font shard manifest entry")
  }
  const page = Math.floor(shard.start / shardManifest.generator.pageSize)
  if (shardByPage.has(page)) throw new Error(`Duplicate OG font shard page: ${page}`)
  shardByPage.set(page, shard)
}

function interCovers(codePoint: number): boolean {
  let low = 0
  let high = interCoverageRanges.length - 1
  while (low <= high) {
    const middle = Math.floor((low + high) / 2)
    const [start, end] = interCoverageRanges[middle]
    if (codePoint < start) high = middle - 1
    else if (codePoint > end) low = middle + 1
    else return true
  }
  return false
}

function interFont(): OgFont {
  interBuffer ??= readFileSync(join(fontDirectory, "Inter-Bold.ttf"))
  return {
    name: "Inter",
    data: interBuffer,
    weight: 700,
    style: "normal",
  }
}

function shardFont(shard: FontShard): OgFont {
  let data = shardBufferCache.get(shard.file)
  if (!data) {
    data = readFileSync(join(shardDirectory, shard.file))
    shardBufferCache.set(shard.file, data)
  }
  return {
    name: shard.fontName,
    data,
    weight: 700,
    style: "normal",
  }
}

/**
 * Select only the Noto shards needed by the final text. Characters absent
 * from both bundled fonts retain Satori's existing fallback behavior.
 */
export function getOgFontConfig(...texts: string[]): OgFontConfig {
  const selectedShards = new Map<number, FontShard>()
  for (const text of texts) {
    for (const character of text) {
      const codePoint = character.codePointAt(0)
      if (codePoint === undefined || interCovers(codePoint)) continue
      const page = Math.floor(codePoint / shardManifest.generator.pageSize)
      const shard = shardByPage.get(page)
      if (shard) selectedShards.set(page, shard)
    }
  }

  const orderedShards = [...selectedShards.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, shard]) => shard)
  const fonts = [interFont(), ...orderedShards.map(shardFont)]
  return {
    fonts,
    fontFamily: fonts.map((font) => font.name).join(", "),
  }
}
