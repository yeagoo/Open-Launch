#!/usr/bin/env bun
import { existsSync } from "node:fs"
import { cp, mkdir, readdir, readFile, rm, stat } from "node:fs/promises"
import { resolve } from "node:path"

const root = process.cwd()
const standalone = resolve(root, ".next", "standalone")

async function main() {
  if (!existsSync(resolve(standalone, "server.js"))) {
    throw new Error("Next.js standalone server was not generated")
  }

  const standalonePublic = resolve(standalone, "public")
  const standaloneStatic = resolve(standalone, ".next", "static")
  await rm(standalonePublic, { force: true, recursive: true })
  await rm(standaloneStatic, { force: true, recursive: true })
  await mkdir(resolve(standalone, ".next"), { recursive: true })
  await cp(resolve(root, "public"), standalonePublic, { recursive: true })
  await cp(resolve(root, ".next", "static"), standaloneStatic, { recursive: true })

  const runtimeFontDirectory = resolve(standalone, "assets", "fonts")
  // Defense in depth for artifacts produced from an older/stale Next trace.
  // The full TTF is a development input for reproducible shard generation,
  // never a runtime dependency.
  await rm(resolve(runtimeFontDirectory, "NotoSansSC-Bold.ttf"), { force: true })
  await verifyRuntimeFonts(runtimeFontDirectory)

  // Runtime secrets are supplied by the service EnvironmentFile. Never package
  // local dotenv files into the deployable standalone artifact.
  for (const name of [".env", ".env.local", ".env.production", ".env.development"]) {
    await rm(resolve(standalone, name), { force: true })
  }

  console.log(
    "[prepare-standalone] copied public/static assets, verified sharded OG fonts, and removed dotenv files",
  )
}

async function verifyRuntimeFonts(fontDirectory: string): Promise<void> {
  const shardDirectory = resolve(fontDirectory, "noto-sans-sc-bold-shards")
  const manifestPath = resolve(shardDirectory, "manifest.json")
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
    shards?: Array<{ file?: unknown; bytes?: unknown }>
    totalShardBytes?: unknown
  }
  if (!Array.isArray(manifest.shards) || !Number.isSafeInteger(manifest.totalShardBytes)) {
    throw new Error("Invalid standalone OG font shard manifest")
  }

  const expectedShardFiles = new Set(["manifest.json"])
  let totalShardBytes = 0
  for (const shard of manifest.shards) {
    if (
      typeof shard.file !== "string" ||
      !/^[0-9a-f]{6}-[0-9a-f]{6}\.woff$/.test(shard.file) ||
      !Number.isSafeInteger(shard.bytes) ||
      Number(shard.bytes) <= 0
    ) {
      throw new Error("Invalid standalone OG font shard entry")
    }
    expectedShardFiles.add(shard.file)
    const shardStats = await stat(resolve(shardDirectory, shard.file))
    if (!shardStats.isFile() || shardStats.size !== shard.bytes) {
      throw new Error(`Standalone OG font shard mismatch: ${shard.file}`)
    }
    totalShardBytes += shardStats.size
  }
  if (totalShardBytes !== manifest.totalShardBytes) {
    throw new Error("Standalone OG font shard total does not match manifest")
  }

  const [fontEntries, shardEntries, interStats] = await Promise.all([
    readdir(fontDirectory, { withFileTypes: true }),
    readdir(shardDirectory, { withFileTypes: true }),
    stat(resolve(fontDirectory, "Inter-Bold.ttf")),
  ])
  const unexpectedFontEntries = fontEntries
    .filter(
      (entry) =>
        !(
          (entry.isFile() && entry.name === "Inter-Bold.ttf") ||
          (entry.isDirectory() && entry.name === "noto-sans-sc-bold-shards")
        ),
    )
    .map((entry) => entry.name)
  const unexpectedShardEntries = shardEntries
    .filter((entry) => !entry.isFile() || !expectedShardFiles.has(entry.name))
    .map((entry) => entry.name)
  const missingShardEntries = [...expectedShardFiles].filter(
    (file) => !shardEntries.some((entry) => entry.isFile() && entry.name === file),
  )
  if (
    !interStats.isFile() ||
    interStats.size <= 0 ||
    unexpectedFontEntries.length > 0 ||
    unexpectedShardEntries.length > 0 ||
    missingShardEntries.length > 0
  ) {
    throw new Error(
      `Unexpected standalone font inventory: root=${unexpectedFontEntries.join(",") || "ok"} ` +
        `shards=${unexpectedShardEntries.join(",") || "ok"} ` +
        `missing=${missingShardEntries.join(",") || "none"}`,
    )
  }
}

main().catch((error) => {
  console.error("[prepare-standalone]", error)
  process.exit(1)
})
