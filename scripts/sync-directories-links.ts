#!/usr/bin/env bun
// Explicit, review-time sync of friend-link data from the directories-links repo
// (https://github.com/yeagoo/directories-links). Fetches link.json plus the
// SVG logos it references and writes committed snapshots. This script is not
// part of `bun run build`: upstream changes must produce a reviewable commit
// instead of silently changing an artifact built from the same source SHA.
//
// Fail-soft: if the fetch fails, the existing committed snapshot is kept and
// the build proceeds (only the very first build with no snapshot hard-fails).
import { existsSync } from "node:fs"
import { mkdir, writeFile } from "node:fs/promises"
import { basename, join } from "node:path"

const UPSTREAM_COMMIT = "9abf28985a0db991a0c5f425e6a7e2ff733af6f2"
const RAW_BASE = `https://raw.githubusercontent.com/yeagoo/directories-links/${UPSTREAM_COMMIT}`
const SNAPSHOT = "lib/directories-links.json"
const LOGO_DIR = "public/partner-logos"
const MAX_JSON_BYTES = 2 * 1024 * 1024
const MAX_SVG_BYTES = 128 * 1024

function validateHttpUrl(value: unknown): boolean {
  if (typeof value !== "string" || value.length > 2048) return false
  try {
    const url = new URL(value)
    return (url.protocol === "http:" || url.protocol === "https:") && !url.username && !url.password
  } catch {
    return false
  }
}

function validateSiteArray(value: unknown): value is { logo_svg?: string | null }[] {
  if (!Array.isArray(value) || value.length > 5000) return false
  return value.every((site) => {
    if (!site || typeof site !== "object") return false
    const entry = site as Record<string, unknown>
    if (!validateHttpUrl(entry.url)) return false
    return (
      entry.logo_svg === undefined ||
      entry.logo_svg === null ||
      (typeof entry.logo_svg === "string" &&
        /^\/assets\/logos\/[a-zA-Z0-9._-]+\.svg$/.test(entry.logo_svg))
    )
  })
}

function validateSvg(svg: string): boolean {
  if (Buffer.byteLength(svg) > MAX_SVG_BYTES || !/<svg[\s>]/i.test(svg)) return false
  return !/<(?:script|foreignObject|iframe|object|embed)\b|on[a-z]+\s*=|javascript:|data:text\/html/i.test(
    svg,
  )
}

async function main() {
  let json: Record<string, unknown>
  try {
    const res = await fetch(`${RAW_BASE}/link.json`, { signal: AbortSignal.timeout(30_000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const bytes = new Uint8Array(await res.arrayBuffer())
    if (bytes.byteLength > MAX_JSON_BYTES) throw new Error("link.json exceeds size limit")
    json = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>
    if (
      !validateSiteArray(json.footer_navigation_sites) ||
      !validateSiteArray(json.authority_documentation_sites) ||
      !validateSiteArray(json.all_friend_links)
    ) {
      throw new Error("unexpected link.json shape (missing required arrays)")
    }
  } catch (err) {
    console.warn(`[sync-directories-links] fetch failed: ${err}. Keeping existing snapshot.`)
    if (!existsSync(SNAPSHOT)) {
      throw new Error(`No snapshot at ${SNAPSHOT} and fetch failed — cannot build.`)
    }
    return
  }

  await writeFile(SNAPSHOT, JSON.stringify(json, null, 2) + "\n")
  console.log(`[sync-directories-links] wrote ${SNAPSHOT} (schema_version=${json.schema_version})`)

  // Mirror the referenced SVG logos into public/ (best-effort per file).
  await mkdir(LOGO_DIR, { recursive: true })
  const sites = [
    ...(json.footer_navigation_sites as { logo_svg?: string | null }[]),
    ...(json.authority_documentation_sites as { logo_svg?: string | null }[]),
  ]
  const seen = new Set<string>()
  let ok = 0
  let kept = 0
  for (const s of sites) {
    const p = s?.logo_svg
    if (!p || typeof p !== "string" || seen.has(p)) continue
    seen.add(p)
    const name = basename(p)
    try {
      const r = await fetch(`${RAW_BASE}${p}`, { signal: AbortSignal.timeout(20_000) })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const svg = await r.text()
      if (!validateSvg(svg)) throw new Error("SVG failed security validation")
      await writeFile(join(LOGO_DIR, name), svg)
      ok++
    } catch (err) {
      kept++
      if (!existsSync(join(LOGO_DIR, name))) {
        console.warn(`[sync-directories-links] logo ${name} failed, no local copy: ${err}`)
      }
    }
  }
  console.log(`[sync-directories-links] logos: ${ok} fetched, ${kept} kept/failed`)
}

main().catch((err) => {
  console.error("[sync-directories-links]", err)
  process.exit(1)
})
