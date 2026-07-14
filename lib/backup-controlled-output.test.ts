import { spawn } from "node:child_process"
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

import { afterEach, describe, expect, it } from "vitest"

const tempDirectories = new Set<string>()

afterEach(() => {
  for (const directory of tempDirectories) {
    rmSync(directory, { recursive: true, force: true })
  }
  tempDirectories.clear()
})

function writeExecutable(filePath: string, source: string): void {
  writeFileSync(filePath, `#!/usr/bin/env node\n${source}`)
  chmodSync(filePath, 0o700)
}

function runControlledDump(
  envFile: string,
  temporaryOutputPath: string,
  finalOutputPath: string,
  binDirectory: string,
): Promise<{ exitCode: number | null; stderr: string }> {
  const child = spawn(
    "bun",
    [resolve(process.cwd(), "scripts/ops/backup-db.ts"), `--env=${envFile}`],
    {
      env: {
        ...process.env,
        OPSCTL_BACKUP_DUMP_OUTPUT: temporaryOutputPath,
        OPSCTL_BACKUP_DUMP_FINAL_OUTPUT: finalOutputPath,
        AWS_SECRET_ACCESS_KEY: "must-not-reach-pg-dump",
        PATH: `${binDirectory}:${process.env.PATH ?? ""}`,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  )
  let stderr = ""
  child.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString("utf8")
  })
  return new Promise((resolveExit, reject) => {
    child.once("error", reject)
    child.once("close", (exitCode) => resolveExit({ exitCode, stderr }))
  })
}

describe("opsctl controlled database output", () => {
  it("uses the final zstd extension and keeps the temporary output private", async () => {
    const root = mkdtempSync(join(tmpdir(), "open-launch-controlled-output-"))
    tempDirectories.add(root)
    const binDirectory = join(root, "bin")
    mkdirSync(binDirectory)
    writeExecutable(
      join(binDirectory, "pg_dump"),
      `const fs = require("node:fs");
if (process.env.AWS_SECRET_ACCESS_KEY) process.exit(9);
const outputIndex = process.argv.indexOf("--file") + 1;
fs.writeFileSync(process.argv[outputIndex], "plain-postgres-dump");
`,
    )
    writeExecutable(
      join(binDirectory, "zstd"),
      `const fs = require("node:fs");
const outputIndex = process.argv.indexOf("-o") + 1;
const inputPath = process.argv.at(-1);
fs.writeFileSync(process.argv[outputIndex], Buffer.concat([
  Buffer.from([0x28, 0xb5, 0x2f, 0xfd]),
  fs.readFileSync(inputPath),
]));
`,
    )
    const envFile = join(root, ".env.test")
    const temporaryOutputPath = join(root, ".database.sql.zst.opsctl-temporary")
    const finalOutputPath = join(root, "database.sql.zst")
    writeFileSync(envFile, "DATABASE_URL=postgresql://test:test@127.0.0.1/test\n")

    const result = await runControlledDump(
      envFile,
      temporaryOutputPath,
      finalOutputPath,
      binDirectory,
    )

    expect(result).toEqual({ exitCode: 0, stderr: "" })
    expect(readFileSync(temporaryOutputPath).subarray(0, 4)).toEqual(
      Buffer.from([0x28, 0xb5, 0x2f, 0xfd]),
    )
    expect(statSync(temporaryOutputPath).mode & 0o777).toBe(0o600)
  })

  it("retries one transient pg_dump failure without publishing partial data", async () => {
    const root = mkdtempSync(join(tmpdir(), "open-launch-controlled-retry-"))
    tempDirectories.add(root)
    const binDirectory = join(root, "bin")
    mkdirSync(binDirectory)
    const attemptFile = join(root, "attempts")
    writeExecutable(
      join(binDirectory, "pg_dump"),
      `const fs = require("node:fs");
const attemptFile = ${JSON.stringify(attemptFile)};
const attempts = fs.existsSync(attemptFile) ? Number(fs.readFileSync(attemptFile, "utf8")) : 0;
fs.writeFileSync(attemptFile, String(attempts + 1));
const outputIndex = process.argv.indexOf("--file") + 1;
fs.writeFileSync(process.argv[outputIndex], attempts === 0 ? "partial" : "complete-postgres-dump");
if (attempts === 0) process.exit(1);
`,
    )
    writeExecutable(
      join(binDirectory, "zstd"),
      `const fs = require("node:fs");
const outputIndex = process.argv.indexOf("-o") + 1;
const inputPath = process.argv.at(-1);
fs.writeFileSync(process.argv[outputIndex], Buffer.concat([
  Buffer.from([0x28, 0xb5, 0x2f, 0xfd]),
  fs.readFileSync(inputPath),
]));
`,
    )
    const envFile = join(root, ".env.test")
    const temporaryOutputPath = join(root, ".database.sql.zst.opsctl-temporary")
    const finalOutputPath = join(root, "database.sql.zst")
    writeFileSync(envFile, "DATABASE_URL=postgresql://test:test@127.0.0.1/test\n")

    const result = await runControlledDump(
      envFile,
      temporaryOutputPath,
      finalOutputPath,
      binDirectory,
    )

    expect(result.exitCode).toBe(0)
    expect(result.stderr).toContain("pg_dump attempt 1/2 failed; retrying")
    expect(readFileSync(attemptFile, "utf8")).toBe("2")
    expect(readFileSync(temporaryOutputPath).subarray(4).toString("utf8")).toBe(
      "complete-postgres-dump",
    )
  }, 10_000)
})
