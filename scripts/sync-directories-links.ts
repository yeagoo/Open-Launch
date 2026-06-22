#!/usr/bin/env bun
// Build-time sync of friend-link data from the directories-links repo
// (https://github.com/yeagoo/directories-links). Fetches link.json plus the
// SVG logos it references and writes committed snapshots, so the footer, the
// /friends page, and the DR values shown on /pricing always reflect the latest
// upstream data at build time.
//
// Fail-soft: if the fetch fails, the existing committed snapshot is kept and
// the build proceeds (only the very first build with no snapshot hard-fails).
import { existsSync } from "node:fs"
import { mkdir, writeFile } from "node:fs/promises"
import { basename, join } from "node:path"

const RAW_BASE = "https://raw.githubusercontent.com/yeagoo/directories-links/main"
const SNAPSHOT = "lib/directories-links.json"
const LOGO_DIR = "public/partner-logos"

async function main() {
  let json: Record<string, unknown>
  try {
    const res = await fetch(`${RAW_BASE}/link.json`, { signal: AbortSignal.timeout(30_000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    json = (await res.json()) as Record<string, unknown>
    if (
      !Array.isArray(json.footer_navigation_sites) ||
      !Array.isArray(json.authority_documentation_sites) ||
      !Array.isArray(json.all_friend_links)
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
    ...(json.footer_navigation_sites as { logo_svg?: string }[]),
    ...(json.authority_documentation_sites as { logo_svg?: string }[]),
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
      await writeFile(join(LOGO_DIR, name), await r.text())
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
