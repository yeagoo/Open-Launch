import { createHash } from "node:crypto"
import { readFile, stat } from "node:fs/promises"
import { resolve } from "node:path"

import shardManifest from "@/assets/fonts/noto-sans-sc-bold-shards/manifest.json"
import { describe, expect, it } from "vitest"

import { getOgFontConfig } from "@/lib/og-fonts"
import { brandedOgImage } from "@/lib/og-template"

const repositoryRoot = resolve(import.meta.dirname, "..")
const shardDirectory = resolve(repositoryRoot, "assets/fonts/noto-sans-sc-bold-shards")

describe("OG font shards", () => {
  it("keeps Latin-only images on the small Inter font", () => {
    const config = getOgFontConfig("Open Launch", "Launch products people love")
    expect(config.fonts.map((font) => font.name)).toEqual(["Inter"])
    expect(config.fontFamily).toBe("Inter")
  })

  it("loads only the deterministic WOFF pages needed by CJK text", () => {
    const first = getOgFontConfig("中文项目")
    const second = getOgFontConfig("中文项目")
    expect(first.fonts.length).toBeGreaterThan(1)
    expect(first.fonts.every((font) => font.data.byteLength > 0)).toBe(true)
    expect(first.fonts.map((font) => font.name)).toEqual(second.fonts.map((font) => font.name))
    expect(first.fonts[0].data).toBe(second.fonts[0].data)
    expect(first.fonts.reduce((sum, font) => sum + font.data.byteLength, 0)).toBeLessThan(
      shardManifest.sourceBytes,
    )
  })

  it("renders a real PNG across Chinese and Japanese shards", async () => {
    const response = brandedOgImage("中文项目", "日本語の説明")
    const bytes = new Uint8Array(await response.arrayBuffer())
    expect(response.headers.get("content-type")).toBe("image/png")
    expect([...bytes.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
    expect(bytes.byteLength).toBeGreaterThan(1_000)
  })

  it("binds every generated shard to the checked-in manifest", async () => {
    let totalBytes = 0
    for (const shard of shardManifest.shards) {
      const path = resolve(shardDirectory, shard.file)
      const [fileStats, content] = await Promise.all([stat(path), readFile(path)])
      expect(fileStats.size).toBe(shard.bytes)
      expect(createHash("sha256").update(content).digest("hex")).toBe(shard.sha256)
      totalBytes += fileStats.size
    }
    expect(totalBytes).toBe(shardManifest.totalShardBytes)
    expect(totalBytes).toBeLessThan(shardManifest.sourceBytes * 0.7)
  })
})
