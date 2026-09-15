#!/usr/bin/env bun
/** Render and hydrate the SAME React components used by /design-preview/community. */
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { gzipSync } from "node:zlib"

import tailwindcss from "@tailwindcss/postcss"
import postcss from "postcss"
import { renderToString } from "react-dom/server"

import { CommunityPreview } from "../app/design-preview/community/community-preview"

const root = resolve(import.meta.dirname, "..")
const outdir = resolve(root, "artifacts/community-preview")
await mkdir(outdir, { recursive: true })
const result = await Bun.build({
  entrypoints: [resolve(root, "app/design-preview/community/browser.tsx")],
  outdir,
  target: "browser",
  minify: true,
  splitting: true,
  define: { "process.env.NODE_ENV": '"production"' },
  naming: { entry: "[name].js", chunk: "[name]-[hash].js" },
})
if (!result.success) throw new Error(result.logs.map(String).join("\n"))
const totalGzip = (
  await Promise.all(
    result.outputs
      .filter((output) => output.path.endsWith(".js"))
      .map(async (output) => gzipSync(await output.arrayBuffer()).byteLength),
  )
).reduce((a, b) => a + b, 0)
const budget = 180 * 1024
if (totalGzip > budget) throw new Error(`Preview JS exceeds ${budget} bytes gzip: ${totalGzip}`)
const cssEntry = resolve(root, "app/globals.css")
const globalCSS = await postcss([tailwindcss()]).process(await readFile(cssEntry, "utf8"), {
  from: cssEntry,
})
const communityCSS = await readFile(resolve(root, "components/community/community.css"), "utf8")
await writeFile(
  resolve(outdir, "community.css"),
  globalCSS.css +
    "\n:root{--font-sans:Inter,system-ui,sans-serif;--font-heading:Outfit,system-ui,sans-serif;}\n" +
    communityCSS,
)
await copyFile(resolve(root, "public/logo.svg"), resolve(outdir, "logo.svg"))
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Community · Phase 1 preview</title><link rel="stylesheet" href="community.css"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;650;700&family=Outfit:wght@600;700&display=swap"></head><body><div id="community-root">${renderToString(<CommunityPreview />)}</div><script type="module" src="browser.js"></script></body></html>`
await writeFile(resolve(outdir, "index.html"), html)
await writeFile(
  resolve(outdir, "bundle-report.json"),
  JSON.stringify(
    {
      allJavaScriptGzipBytes: totalGzip,
      budgetBytes: budget,
      note: "All preview JS including the lazy moderation chunk; not a production route measurement.",
    },
    null,
    2,
  ),
)
console.log(
  `Community preview: ${outdir}\nAll JS gzip: ${(totalGzip / 1024).toFixed(1)} KiB / 180 KiB budget`,
)
