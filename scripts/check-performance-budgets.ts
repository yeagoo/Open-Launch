#!/usr/bin/env bun
import { readFile } from "node:fs/promises"

import {
  evaluatePerformanceBudget,
  type PerformanceBudgetConfig,
  type PerformanceMeasurements,
} from "../lib/performance-budget"

type BuildReport = {
  route?: unknown
  totals?: { gzipBytes?: unknown }
}

type LighthouseReport = {
  finalUrl?: unknown
  categories?: { performance?: { score?: unknown } }
  audits?: { "largest-contentful-paint"?: { numericValue?: unknown } }
}

function argument(name: string): string {
  const index = process.argv.indexOf(name)
  const value = index >= 0 ? process.argv[index + 1] : undefined
  if (!value || value.startsWith("--")) throw new Error(`${name} is required`)
  return value
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} is missing or invalid`)
  }
  return value
}

async function main() {
  const configPath = argument("--config")
  const buildPath = argument("--build")
  const lighthousePath = argument("--lighthouse")
  const baseUrl = argument("--base-url")
  const target = new URL(baseUrl)
  if (!["127.0.0.1", "localhost", "::1"].includes(target.hostname)) {
    throw new Error("performance release observation may only target loopback")
  }

  const [config, build, lighthouse] = (await Promise.all([
    readFile(configPath, "utf8").then((value) => JSON.parse(value)),
    readFile(buildPath, "utf8").then((value) => JSON.parse(value)),
    readFile(lighthousePath, "utf8").then((value) => JSON.parse(value)),
  ])) as [PerformanceBudgetConfig, BuildReport, LighthouseReport]

  if (!["observe", "enforce"].includes(config.mode)) {
    throw new Error("performance budget mode must be observe or enforce")
  }
  if (build.route !== config.route) {
    throw new Error(`build report route mismatch: expected ${config.route}`)
  }

  const response = await fetch(new URL(config.path, target), {
    headers: { "Accept-Encoding": "identity" },
  })
  if (!response.ok) throw new Error(`HTML measurement failed with HTTP ${response.status}`)
  const htmlBytes = Buffer.byteLength(await response.text())
  const finalUrl = new URL(String(lighthouse.finalUrl))
  if (finalUrl.origin !== target.origin || finalUrl.pathname !== config.path) {
    throw new Error(`Lighthouse target mismatch: ${finalUrl.origin}${finalUrl.pathname}`)
  }

  const measurements: PerformanceMeasurements = {
    routeJsGzipBytes: finiteNumber(build.totals?.gzipBytes, "route JS gzip bytes"),
    htmlBytes,
    lighthousePerformance: finiteNumber(
      lighthouse.categories?.performance?.score,
      "Lighthouse performance score",
    ),
    lcpMs: finiteNumber(
      lighthouse.audits?.["largest-contentful-paint"]?.numericValue,
      "Lighthouse LCP",
    ),
  }
  const result = evaluatePerformanceBudget(config, measurements)
  console.log(JSON.stringify({ config: configPath, measurements, ...result }, null, 2))
  if (result.blocking) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
