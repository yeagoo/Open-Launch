#!/usr/bin/env bun
import { mkdir } from "node:fs/promises"
import { resolve } from "node:path"

const outputDirectory = resolve(process.cwd(), ".next", "standalone")
await mkdir(outputDirectory, { recursive: true })

interface BunPluginBuilder {
  onResolve(options: { filter: RegExp }, callback: () => { path: string; namespace: string }): void
  onLoad(
    options: { filter: RegExp; namespace: string },
    callback: () => { contents: string; loader: "js" },
  ): void
}

interface BunBuildResult {
  success: boolean
  logs: unknown[]
}

interface BunRuntime {
  build(options: {
    entrypoints: string[]
    outdir: string
    naming: string
    target: "node"
    format: "esm"
    packages: "bundle"
    minify: boolean
    sourcemap: "external"
    plugins: Array<{ name: string; setup(builder: BunPluginBuilder): void }>
  }): Promise<BunBuildResult>
}

const bun = (globalThis as typeof globalThis & { Bun?: BunRuntime }).Bun
if (!bun) throw new Error("build-cron-ledger-worker must run with Bun")

const result = await bun.build({
  entrypoints: [resolve(process.cwd(), "workers", "cron-ledger-worker.ts")],
  outdir: outputDirectory,
  naming: "cron-ledger-worker.mjs",
  target: "node",
  format: "esm",
  packages: "bundle",
  minify: true,
  sourcemap: "external",
  plugins: [
    {
      name: "server-only-stub",
      setup(builder) {
        builder.onResolve({ filter: /^server-only$/ }, () => ({
          path: "server-only",
          namespace: "server-only-stub",
        }))
        builder.onLoad({ filter: /.*/, namespace: "server-only-stub" }, () => ({
          contents: "export {}",
          loader: "js",
        }))
      },
    },
  ],
})

if (!result.success) {
  for (const log of result.logs) console.error(log)
  throw new Error("cron ledger worker bundle failed")
}

console.log("[cron-worker] generated .next/standalone/cron-ledger-worker.mjs")
