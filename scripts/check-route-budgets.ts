#!/usr/bin/env bun
import { execFile } from "node:child_process"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { promisify } from "node:util"

import {
  evaluateRouteBudgets,
  parseRouteBudgetConfig,
  type RouteMeasurement,
} from "@/lib/route-budget"

const execFileAsync = promisify(execFile)
const repositoryRoot = resolve(import.meta.dirname, "..")

async function main(): Promise<void> {
  const configPath = parseArguments(process.argv.slice(2))
  const config = parseRouteBudgetConfig(
    JSON.parse(await readFile(resolve(repositoryRoot, configPath), "utf8")),
  )
  const measurements: RouteMeasurement[] = []

  for (const budget of config.routes) {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [resolve(repositoryRoot, "scripts/measure-build-baseline.ts"), "--route", budget.route],
      { cwd: repositoryRoot, maxBuffer: 16 * 1024 * 1024 },
    )
    if (stderr.trim()) throw new Error(`route measurement wrote to stderr: ${stderr.trim()}`)
    const report = JSON.parse(stdout) as {
      route?: unknown
      initial?: { totals?: { gzipBytes?: unknown }; chunkCount?: unknown }
    }
    if (
      report.route !== budget.route ||
      !Number.isSafeInteger(report.initial?.totals?.gzipBytes) ||
      !Number.isSafeInteger(report.initial?.chunkCount)
    ) {
      throw new Error(`invalid route measurement report: ${budget.route}`)
    }
    measurements.push({
      route: budget.route,
      initialGzipBytes: Number(report.initial?.totals?.gzipBytes),
    })
  }

  const evaluation = evaluateRouteBudgets(config, measurements)
  console.log(JSON.stringify({ configPath, measurements, evaluation }, null, 2))
  if (evaluation.blocking) process.exitCode = 1
}

function parseArguments(argv: string[]): string {
  let config = "config/route-budgets.json"
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== "--config") throw new Error(`Unknown argument: ${argv[index]}`)
    const value = argv[++index]
    if (!value || value.startsWith("--")) throw new Error("--config requires a value")
    config = value
  }
  return config
}

main().catch((error) => {
  console.error("[route-budgets]", error)
  process.exit(1)
})
