#!/usr/bin/env bun
import { spawn } from "node:child_process"
import fs from "node:fs/promises"
import path from "node:path"

import * as dotenv from "dotenv"

type Args = {
  envFile: string
  dryRun: boolean
}

function parseArgs(argv: string[]): Args {
  const value = (name: string) =>
    argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3)
  return {
    envFile: value("env") ?? ".env.local",
    dryRun: argv.includes("--dry-run"),
  }
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} missing`)
  }
  return value
}

function pgEnv(databaseUrl: string): NodeJS.ProcessEnv {
  const url = new URL(databaseUrl)
  return {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    NODE_ENV: process.env.NODE_ENV,
    LANG: process.env.LANG,
    LC_ALL: process.env.LC_ALL,
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGDATABASE: url.pathname.replace(/^\//, ""),
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGCONNECT_TIMEOUT: "30",
    PGSSLMODE: url.searchParams.get("sslmode") || undefined,
  }
}

async function run(program: string, args: string[], env?: NodeJS.ProcessEnv): Promise<void> {
  const child = spawn(program, args, {
    env: env ? { ...process.env, ...env } : process.env,
    stdio: ["ignore", "ignore", "pipe"],
  })
  let stderr = ""
  child.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString("utf8")
    if (stderr.length > 8000) {
      stderr = stderr.slice(-8000)
    }
  })
  const code = await new Promise<number | null>((resolve, reject) => {
    child.once("error", reject)
    child.once("close", resolve)
  })
  if (code !== 0) {
    throw new Error(`${program} exited with ${code ?? "unknown"}: ${stderr.trim() || "no stderr"}`)
  }
}

function isZstdPath(outputPath: string): boolean {
  return outputPath.endsWith(".zst")
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const controlledOutputPath = process.env.OPSCTL_BACKUP_DUMP_OUTPUT
  dotenv.config({ path: args.envFile, override: true })
  if (controlledOutputPath) {
    process.env.OPSCTL_BACKUP_DUMP_OUTPUT = controlledOutputPath
  }

  const outputPath = requireEnv("OPSCTL_BACKUP_DUMP_OUTPUT")
  const databaseUrl = requireEnv("DATABASE_URL")
  const outputDir = path.dirname(outputPath)
  const tempBase = path.join(outputDir, `.opsctl-${process.pid}-${Date.now()}`)
  const plainSqlPath = isZstdPath(outputPath) ? `${tempBase}.sql` : tempBase
  const compressedPath = isZstdPath(outputPath) ? `${tempBase}.sql.zst` : plainSqlPath

  if (args.dryRun) {
    console.log(JSON.stringify({ ok: true, dryRun: true, outputPath }))
    return
  }

  await fs.mkdir(outputDir, { recursive: true })
  try {
    await run(
      "pg_dump",
      [
        "--format=plain",
        "--no-owner",
        "--no-privileges",
        "--encoding=UTF8",
        "--file",
        plainSqlPath,
      ],
      pgEnv(databaseUrl),
    )
    if (isZstdPath(outputPath)) {
      await run("zstd", ["-T0", "-q", "-f", "-o", compressedPath, plainSqlPath])
      await fs.rm(plainSqlPath, { force: true })
    }
    await fs.chmod(compressedPath, 0o600)
    await fs.rename(compressedPath, outputPath)
    const stat = await fs.stat(outputPath)
    if (!stat.isFile() || stat.size === 0) {
      throw new Error(`backup dump is empty: ${outputPath}`)
    }
    console.log(JSON.stringify({ ok: true, outputPath, bytes: stat.size }))
  } finally {
    await fs.rm(plainSqlPath, { force: true }).catch(() => undefined)
    await fs.rm(compressedPath, { force: true }).catch(() => undefined)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(2)
})
