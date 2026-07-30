import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

import { describe, expect, it } from "vitest"

const repositoryRoot = resolve(import.meta.dirname, "..")

describe("Cron canary authority contract", () => {
  it("keeps the dispatcher and independent worker on the same task allowlist", async () => {
    const [dispatcher, worker] = await Promise.all([
      readFile(resolve(repositoryRoot, "app/api/cron/dispatch/route.ts"), "utf8"),
      readFile(resolve(repositoryRoot, "workers/cron-ledger-worker.ts"), "utf8"),
    ])

    expect(dispatcher).toMatch(
      /materializeCronLedger\("ledger", now, \{\s*allowedTaskPaths: authority\.ledgerTaskPaths/,
    )
    expect(dispatcher).toContain("cronTaskAuthority(t.path, authority)")
    expect(dispatcher).toMatch(
      /runCronLedgerBatch\(\{\s*apiKey,\s*baseUrl,\s*allowedTaskPaths: authority\.ledgerTaskPaths/,
    )
    expect(dispatcher).toMatch(
      /resolveInternalCronBaseUrl\(\s*process\.env\.INTERNAL_BASE_URL,\s*process\.env\.PORT \?\? "3000"/,
    )
    expect(worker).toMatch(
      /runCronLedgerBatch\(\{\s*apiKey,\s*baseUrl,\s*allowedTaskPaths: ledgerTaskPaths/,
    )
  })

  it("enforces the allowlist at materialize, claim, and lease recovery boundaries", async () => {
    const ledger = await readFile(resolve(repositoryRoot, "lib/cron-ledger-db.ts"), "utf8")

    expect(ledger).toContain('"cron materializer allowlist"')
    expect(ledger).toContain("resolveCronRuntimeAuthority({")
    expect(ledger).toContain("assertCronLedgerScheduleInventory(rows)")
    expect(ledger).toContain('"cron worker allowlist"')
    expect(ledger).toContain("await recoverExpiredCronLeases(now, allowedTaskPaths)")
    expect(ledger).toContain('"cron lease recovery allowlist"')
    expect(ledger).toMatch(
      /normalizedTaskPaths \? inArray\(cronJob\.taskPath, normalizedTaskPaths\) : undefined/,
    )
  })
})
