#!/usr/bin/env bun
import { readFile, stat } from "node:fs/promises"

import {
  evaluateCommunityTelemetryBudget,
  parseCommunityTelemetryArguments,
  parseCommunityTelemetryNdjson,
  summarizeCommunityTelemetry,
} from "@/lib/community/telemetry-review"

const MAX_INPUT_BYTES = 16 * 1024 * 1024

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  if (argv.length === 1 && (argv[0] === "--help" || argv[0] === "-h")) {
    printUsage()
    return
  }

  const options = parseCommunityTelemetryArguments(argv)
  const input = await readTelemetryInput(options.inputPath)
  const parsed = parseCommunityTelemetryNdjson(input.text)
  const report = summarizeCommunityTelemetry(parsed)
  const budget = evaluateCommunityTelemetryBudget(options, report)

  console.log(
    JSON.stringify(
      {
        input: {
          bytes: input.bytes,
          nonEmptyLines: report.nonEmptyLineCount,
          ignoredRecords: report.ignoredRecordCount,
        },
        eventWindow: {
          firstEventAt: report.firstEventAt,
          lastEventAt: report.lastEventAt,
        },
        events: {
          total: report.communityEventCount,
          slow: report.slowEventCount,
          errors: report.errorEventCount,
          withoutRequestId: report.missingRequestIdEventCount,
        },
        slowOperationDuration: report.slowDuration,
        operations: report.operations,
        budget: {
          ...budget,
          configuredMaxSlowEvents: options.maxSlowEvents ?? null,
          configuredMaxErrorEvents: options.maxErrorEvents ?? null,
          configuredMaxMissingRequestIdEvents: options.maxMissingRequestIdEvents ?? null,
          configuredMaxP95SlowDurationMs: options.maxP95SlowDurationMs ?? null,
        },
      },
      null,
      2,
    ),
  )

  if (!budget.passed) process.exitCode = 1
}

function printUsage(): void {
  console.log(
    [
      "Usage: bun run community:telemetry -- --input <structured-log.ndjson> [options]",
      "",
      "Read a local export of the default JSON structured logs. The command never prints raw log",
      "records, request IDs or errors; it reports only Community aggregate telemetry.",
      "",
      "Options:",
      "  --max-slow-events <0-100000>                 Optional blocking limit for slow-event count",
      "  --max-error-events <0-100000>                Optional blocking limit for error-event count",
      "  --max-missing-request-id-events <0-100000>   Optional blocking correlation limit",
      "  --max-p95-slow-duration-ms <0-86400000>      Optional blocking p95 slow-duration limit",
      "  --help, -h                                    Show this usage text",
    ].join("\n"),
  )
}

async function readTelemetryInput(inputPath: string): Promise<{ text: string; bytes: number }> {
  let size: number
  try {
    const metadata = await stat(inputPath)
    if (!metadata.isFile()) throw new Error("not a file")
    size = metadata.size
  } catch {
    throw new Error("--input must refer to a readable regular file")
  }
  if (size > MAX_INPUT_BYTES) {
    throw new Error(`--input must not exceed ${MAX_INPUT_BYTES} bytes`)
  }

  let bytes: Buffer
  try {
    bytes = await readFile(inputPath)
  } catch {
    throw new Error("--input could not be read")
  }
  if (bytes.byteLength > MAX_INPUT_BYTES) {
    throw new Error(`--input must not exceed ${MAX_INPUT_BYTES} bytes`)
  }
  try {
    return {
      text: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      bytes: bytes.byteLength,
    }
  } catch {
    throw new Error("--input must be valid UTF-8 structured log output")
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "unexpected telemetry review failure"
  console.error(`[community-telemetry] ${message}`)
  process.exit(1)
})
