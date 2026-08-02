import { isAbsolute, relative, resolve } from "node:path"

export interface ClientReferenceManifest {
  clientModules: Record<string, { chunks: string[] }>
  entryJSFiles?: Record<string, string[]>
}

export interface InitialClientChunks {
  chunks: string[]
  source: "entryJSFiles" | "clientModules-fallback"
}

const ROUTE_ASSIGNMENT = "globalThis.__RSC_MANIFEST["

/**
 * Parse the JSON value assigned to a route in Next's client-reference manifest.
 *
 * Webpack emits a compact assignment after an initialization statement, while
 * Turbopack currently emits a whitespace-padded assignment. This deliberately
 * parses the assignment instead of evaluating generated JavaScript.
 */
export function parseClientReferenceManifest(source: string): ClientReferenceManifest {
  const assignmentStart = source.indexOf(ROUTE_ASSIGNMENT)
  if (assignmentStart === -1) throw unsupportedFormat()

  const keyStart = assignmentStart + ROUTE_ASSIGNMENT.length
  const keyEnd = findClosingBracket(source, keyStart)
  let cursor = skipWhitespace(source, keyEnd + 1)
  if (source[cursor] !== "=") throw unsupportedFormat()
  cursor = skipWhitespace(source, cursor + 1)
  if (source[cursor] !== "{") throw unsupportedFormat()

  const jsonEnd = findJsonObjectEnd(source, cursor)
  const parsed = JSON.parse(source.slice(cursor, jsonEnd)) as {
    clientModules?: unknown
    entryJSFiles?: unknown
  }
  if (!isRecord(parsed.clientModules)) {
    throw new Error("clientModules is missing from the manifest")
  }
  for (const [moduleName, module] of Object.entries(parsed.clientModules)) {
    if (
      !isRecord(module) ||
      !Array.isArray(module.chunks) ||
      !module.chunks.every((chunk) => typeof chunk === "string")
    ) {
      throw new Error(`Invalid chunk list for client module: ${moduleName}`)
    }
  }
  if (parsed.entryJSFiles !== undefined) {
    if (!isRecord(parsed.entryJSFiles)) {
      throw new Error("entryJSFiles has an invalid manifest shape")
    }
    for (const [entryName, chunks] of Object.entries(parsed.entryJSFiles)) {
      if (!Array.isArray(chunks) || !chunks.every((chunk) => typeof chunk === "string")) {
        throw new Error(`Invalid entry chunk list: ${entryName}`)
      }
    }
  }
  return parsed as unknown as ClientReferenceManifest
}

export function collectReferencedClientChunks(manifest: ClientReferenceManifest): string[] {
  return normalizeClientChunks(
    Object.values(manifest.clientModules).flatMap((module) => module.chunks),
  )
}

export function selectInitialClientChunks(
  manifest: ClientReferenceManifest,
  entryName: string,
): InitialClientChunks {
  if (manifest.entryJSFiles) {
    const entryChunks = manifest.entryJSFiles[entryName]
    if (!entryChunks) throw new Error(`entryJSFiles is missing route entry: ${entryName}`)
    return { chunks: normalizeClientChunks(entryChunks), source: "entryJSFiles" }
  }
  return {
    chunks: collectReferencedClientChunks(manifest),
    source: "clientModules-fallback",
  }
}

export function resolveNextChunkPath(nextRoot: string, publicPath: string): string {
  if (!publicPath.startsWith("/_next/static/") || publicPath.includes("\\")) {
    throw new Error(`Invalid Next chunk public path: ${publicPath}`)
  }
  let relativePath: string
  try {
    relativePath = decodeURIComponent(publicPath.slice("/_next/".length))
  } catch {
    throw new Error(`Invalid encoding in Next chunk public path: ${publicPath}`)
  }
  if (relativePath.includes("\\") || relativePath.includes("\0")) {
    throw new Error(`Invalid Next chunk public path: ${publicPath}`)
  }
  const filePath = resolve(nextRoot, relativePath)
  const pathFromRoot = relative(nextRoot, filePath)
  if (!pathFromRoot || pathFromRoot.startsWith("..") || isAbsolute(pathFromRoot)) {
    throw new Error(`Next chunk path escapes the build directory: ${publicPath}`)
  }
  return filePath
}

function normalizeClientChunks(chunks: readonly string[]): string[] {
  return Array.from(
    new Set(
      chunks
        .filter((chunk) => chunk.endsWith(".js"))
        .map((chunk) => (chunk.startsWith("/_next/") ? chunk : `/_next/${chunk}`)),
    ),
  ).sort()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function findClosingBracket(source: string, start: number): number {
  let quote: '"' | "'" | undefined
  let escaped = false
  for (let index = start; index < source.length; index += 1) {
    const character = source[index]
    if (quote) {
      if (escaped) escaped = false
      else if (character === "\\") escaped = true
      else if (character === quote) quote = undefined
    } else if (character === '"' || character === "'") quote = character
    else if (character === "]") return index
  }
  throw unsupportedFormat()
}

function findJsonObjectEnd(source: string, start: number): number {
  let depth = 0
  let inString = false
  let escaped = false
  for (let index = start; index < source.length; index += 1) {
    const character = source[index]
    if (inString) {
      if (escaped) escaped = false
      else if (character === "\\") escaped = true
      else if (character === '"') inString = false
      continue
    }
    if (character === '"') inString = true
    else if (character === "{") depth += 1
    else if (character === "}" && --depth === 0) return index + 1
  }
  throw unsupportedFormat()
}

function skipWhitespace(source: string, start: number): number {
  let cursor = start
  while (/\s/.test(source[cursor] ?? "")) cursor += 1
  return cursor
}

function unsupportedFormat(): Error {
  return new Error("Unsupported client-reference manifest format")
}
