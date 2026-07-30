import { execFile } from "node:child_process"
import { readFile, stat } from "node:fs/promises"
import { resolve } from "node:path"
import { promisify } from "node:util"
import { brotliCompressSync, gzipSync } from "node:zlib"

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
const referencedChunks = Array.from(
  new Set(
    Object.values(manifest.clientModules).flatMap((module) =>
      module.chunks.filter((chunk) => chunk.endsWith(".js")),
    ),
  ),
).sort()
const entryName = `[project]/app${route}`
const entryChunks = manifest.entryJSFiles[entryName]
if (!entryChunks) throw new Error(`entryJSFiles is missing route entry: ${entryName}`)
const initialChunks = Array.from(
  new Set(
    entryChunks
      .filter((chunk) => chunk.endsWith(".js"))
      .map((chunk) => (chunk.startsWith("/_next/") ? chunk : `/_next/${chunk}`)),
  ),
).sort()

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
      const relativePath = publicPath.replace(/^\/_next\//, "")
      const content = await readFile(resolve(nextRoot, relativePath))
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
        "Referenced is an upper bound from all client modules; initial uses entryJSFiles. Browser resource timing remains the transfer source of truth.",
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

function parseClientReferenceManifest(source: string): {
  clientModules: Record<string, { chunks: string[] }>
  entryJSFiles: Record<string, string[]>
} {
  const assignment = source.indexOf("] = ")
  const end = source.lastIndexOf(";")
  if (assignment === -1 || end === -1 || end <= assignment) {
    throw new Error("Unsupported client-reference manifest format")
  }
  const parsed = JSON.parse(source.slice(assignment + 4, end)) as {
    clientModules?: Record<string, { chunks?: unknown }>
    entryJSFiles?: Record<string, unknown>
  }
  if (!parsed.clientModules) throw new Error("clientModules is missing from the manifest")
  if (!parsed.entryJSFiles) throw new Error("entryJSFiles is missing from the manifest")
  for (const [moduleName, module] of Object.entries(parsed.clientModules)) {
    if (
      !Array.isArray(module.chunks) ||
      !module.chunks.every((chunk) => typeof chunk === "string")
    ) {
      throw new Error(`Invalid chunk list for client module: ${moduleName}`)
    }
  }
  for (const [entryName, chunks] of Object.entries(parsed.entryJSFiles)) {
    if (!Array.isArray(chunks) || !chunks.every((chunk) => typeof chunk === "string")) {
      throw new Error(`Invalid entry chunk list: ${entryName}`)
    }
  }
  return parsed as {
    clientModules: Record<string, { chunks: string[] }>
    entryJSFiles: Record<string, string[]>
  }
}
