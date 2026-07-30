#!/usr/bin/env bun
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdir, readdir, readFile, stat, unlink, writeFile } from "node:fs/promises"
import { resolve } from "node:path"

const repositoryRoot = resolve(import.meta.dirname, "..")
const interPath = resolve(repositoryRoot, "assets/fonts/Inter-Bold.ttf")
const sourcePath = resolve(repositoryRoot, "assets/fonts/NotoSansSC-Bold.ttf")
const outputDirectory = resolve(repositoryRoot, "assets/fonts/noto-sans-sc-bold-shards")
const manifestPath = resolve(outputDirectory, "manifest.json")
const pageSize = 0x800

type CoveragePlan = {
  interCoverageRanges: Array<[number, number]>
  missingPages: number[]
}

type FontShard = {
  start: number
  end: number
  fontName: string
  file: string
  bytes: number
  sha256: string
}

const coverageScript = String.raw`
import json
import sys
from fontTools.ttLib import TTFont

def codepoints(path):
    font = TTFont(path)
    result = set()
    for table in font["cmap"].tables:
        if table.isUnicode():
            result.update(table.cmap)
    return result

def ranges(values):
    ordered = sorted(values)
    if not ordered:
        return []
    result = []
    start = previous = ordered[0]
    for value in ordered[1:]:
        if value != previous + 1:
            result.append([start, previous])
            start = value
        previous = value
    result.append([start, previous])
    return result

page_size = int(sys.argv[3])
inter = codepoints(sys.argv[1])
noto = codepoints(sys.argv[2])
missing_pages = sorted({value // page_size for value in noto - inter})
print(json.dumps({
    "interCoverageRanges": ranges(inter),
    "missingPages": missing_pages,
}))
`

function commandOutput(command: string, args: string[], label: string): string {
  const result = spawnSync(command, args, { encoding: "utf8" })
  if (result.status !== 0) {
    throw new Error(`${label} failed: ${result.stderr || result.stdout}`)
  }
  return `${result.stdout}${result.stderr}`.trim()
}

function coveragePlan(): CoveragePlan {
  const result = spawnSync(
    "python3",
    ["-c", coverageScript, interPath, sourcePath, String(pageSize)],
    { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 },
  )
  if (result.status !== 0) {
    throw new Error(`font coverage discovery failed: ${result.stderr || result.stdout}`)
  }
  const parsed = JSON.parse(result.stdout) as Partial<CoveragePlan>
  if (
    !Array.isArray(parsed.interCoverageRanges) ||
    !Array.isArray(parsed.missingPages) ||
    !parsed.interCoverageRanges.every(
      (range) =>
        Array.isArray(range) &&
        range.length === 2 &&
        range.every((value) => Number.isSafeInteger(value) && value >= 0),
    ) ||
    !parsed.missingPages.every((page) => Number.isSafeInteger(page) && page >= 0)
  ) {
    throw new Error("font coverage discovery returned an invalid plan")
  }
  return parsed as CoveragePlan
}

function hexadecimal(value: number): string {
  return value.toString(16).padStart(6, "0")
}

async function sha256(path: string): Promise<string> {
  return createHash("sha256")
    .update(await readFile(path))
    .digest("hex")
}

async function clearGeneratedFiles(): Promise<void> {
  await mkdir(outputDirectory, { recursive: true })
  const entries = await readdir(outputDirectory, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.isDirectory() || (!entry.name.endsWith(".woff") && entry.name !== "manifest.json")) {
      throw new Error(`unexpected file in font shard directory: ${entry.name}`)
    }
    await unlink(resolve(outputDirectory, entry.name))
  }
}

async function generateShard(page: number): Promise<FontShard> {
  const start = page * pageSize
  const end = start + pageSize - 1
  const file = `${hexadecimal(start)}-${hexadecimal(end)}.woff`
  const outputPath = resolve(outputDirectory, file)
  const result = spawnSync(
    "pyftsubset",
    [
      sourcePath,
      `--output-file=${outputPath}`,
      "--flavor=woff",
      `--unicodes=U+${start.toString(16).toUpperCase()}-${end.toString(16).toUpperCase()}`,
      "--layout-features=*",
      "--no-hinting",
      "--name-IDs=*",
      "--name-legacy",
      "--name-languages=*",
      "--recalc-average-width",
      "--recalc-max-context",
    ],
    { encoding: "utf8" },
  )
  if (result.status !== 0) {
    throw new Error(`pyftsubset failed for ${file}: ${result.stderr || result.stdout}`)
  }
  const fileStats = await stat(outputPath)
  if (fileStats.size <= 0) throw new Error(`font shard is empty: ${file}`)
  return {
    start,
    end,
    fontName: `Noto Sans SC ${hexadecimal(start)}`,
    file,
    bytes: fileStats.size,
    sha256: await sha256(outputPath),
  }
}

async function main(): Promise<void> {
  if (process.argv.length !== 2) {
    throw new Error("generate-og-font-shards does not accept arguments")
  }
  const pyftsubsetVersion = commandOutput(
    "python3",
    ["-c", "import fontTools; print(fontTools.__version__)"],
    "fontTools version check",
  )
  const plan = coveragePlan()
  await clearGeneratedFiles()

  const shards: FontShard[] = []
  for (const [index, page] of plan.missingPages.entries()) {
    shards.push(await generateShard(page))
    if ((index + 1) % 10 === 0 || index + 1 === plan.missingPages.length) {
      console.log(`Generated ${index + 1}/${plan.missingPages.length} font shards`)
    }
  }

  const sourceStats = await stat(sourcePath)
  const totalShardBytes = shards.reduce((total, shard) => total + shard.bytes, 0)
  const manifest = {
    version: 1,
    // Keep provenance without embedding a relative source-font filename.
    // Next's output file tracer treats filename-looking JSON values as runtime
    // dependencies and would otherwise copy the 10.5 MiB development TTF.
    sourceId: "NotoSansSC-Bold",
    sourceBytes: sourceStats.size,
    sourceSha256: await sha256(sourcePath),
    interSourceId: "Inter-Bold",
    interSha256: await sha256(interPath),
    generator: {
      pageSize,
      pyftsubsetVersion,
      options: [
        "--flavor=woff",
        "--layout-features=*",
        "--no-hinting",
        "--name-IDs=*",
        "--name-legacy",
        "--name-languages=*",
        "--recalc-average-width",
        "--recalc-max-context",
      ],
    },
    interCoverageRanges: plan.interCoverageRanges,
    totalShardBytes,
    shards,
  }
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8")
  console.log(
    `Wrote ${shards.length} shards (${totalShardBytes} bytes, source ${sourceStats.size} bytes)`,
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
