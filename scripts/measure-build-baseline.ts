import { execFile } from "node:child_process"
import { readFile, stat } from "node:fs/promises"
import { resolve } from "node:path"
import { promisify } from "node:util"
import { brotliCompressSync, gzipSync } from "node:zlib"

import {
  collectReferencedClientChunks,
  parseClientReferenceManifest,
  resolveNextChunkPath,
  selectInitialClientChunks,
} from "./lib/client-reference-manifest"

const execFileAsync = promisify(execFile)
const repositoryRoot = resolve(import.meta.dirname, "..")
const nextRoot = resolve(repositoryRoot, ".next")
const { route } = parseArguments(process.argv.slice(2))
if (
  !route.startsWith("/") ||
  route.includes("..") ||
  route.includes("\\") ||
  !route.endsWith("/page")
) {
  throw new Error("--route must be an App Router page path such as /[locale]/page")
}
const manifestPath = resolve(
  nextRoot,
  "server/app",
  `${route.replace(/^\//, "")}_client-reference-manifest.js`,
)

const [source, buildId, manifestStats, commit] = await Promise.all([
  readFile(manifestPath, "utf8"),
  readFile(resolve(nextRoot, "BUILD_ID"), "utf8"),
  stat(manifestPath),
  execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot }).then(({ stdout }) =>
    stdout.trim(),
  ),
])
const manifest = parseClientReferenceManifest(source)
const referencedChunks = collectReferencedClientChunks(manifest)
const entryName = `[project]/app${route}`
const initialSelection = selectInitialClientChunks(manifest, entryName)
const initialChunks = initialSelection.chunks

const referencedSizes = await measureChunks(referencedChunks)
const initialSizes = await measureChunks(initialChunks)

function summarize(sizes: Awaited<ReturnType<typeof measureChunks>>) {
  return {
    chunkCount: sizes.length,
    totals: sizes.reduce(
      (sum, item) => ({
        rawBytes: sum.rawBytes + item.rawBytes,
        gzipBytes: sum.gzipBytes + item.gzipBytes,
        brotliBytes: sum.brotliBytes + item.brotliBytes,
      }),
      { rawBytes: 0, gzipBytes: 0, brotliBytes: 0 },
    ),
    largestChunks: [...sizes].sort((a, b) => b.rawBytes - a.rawBytes).slice(0, 10),
  }
}

async function measureChunks(chunks: string[]) {
  return Promise.all(
    chunks.map(async (publicPath) => {
      const content = await readFile(resolveNextChunkPath(nextRoot, publicPath))
      return {
        path: publicPath,
        rawBytes: content.byteLength,
        gzipBytes: gzipSync(content).byteLength,
        brotliBytes: brotliCompressSync(content).byteLength,
      }
    }),
  )
}

const referencedSummary = summarize(referencedSizes)
const initialSummary = summarize(initialSizes)

console.log(
  JSON.stringify(
    {
      measuredAt: new Date().toISOString(),
      route,
      buildId: buildId.trim(),
      currentCommit: commit,
      artifactBinding: "unverified",
      artifactManifestModifiedAt: manifestStats.mtime.toISOString(),
      measurement:
        "Referenced is an upper bound from all client modules. Initial uses entryJSFiles when available, otherwise the Webpack client-module union. Browser resource timing remains the transfer source of truth.",
      initialChunkSource: initialSelection.source,
      chunkCount: referencedSummary.chunkCount,
      totals: referencedSummary.totals,
      largestChunks: referencedSummary.largestChunks,
      initial: initialSummary,
    },
    null,
    2,
  ),
)

function parseArguments(argv: string[]): { route: string } {
  let route = "/[locale]/page"
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== "--route") throw new Error(`Unknown argument: ${argv[index]}`)
    const value = argv[++index]
    if (!value || value.startsWith("--")) throw new Error("--route requires a value")
    route = value
  }
  return { route }
}
