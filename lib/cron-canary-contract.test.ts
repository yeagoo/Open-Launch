import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

import { describe, expect, it } from "vitest"

import { resolveCronRuntimeAuthority } from "@/lib/cron-cutover"
import { APPROVED_CRON_CANARY_TASK_PATH, cronTaskPolicies } from "@/lib/cron-policy"

const repositoryRoot = resolve(import.meta.dirname, "..")

describe("Cron canary authority contract", () => {
  it("approves exactly one strict task with an exclusive concurrency group", () => {
    const approved = cronTaskPolicies.filter((policy) => policy.decision === "approved")
    expect(approved.map((policy) => policy.path)).toEqual([APPROVED_CRON_CANARY_TASK_PATH])
    expect(approved[0]).toMatchObject({
      idempotency: "strict",
      concurrencyGroup: "syndication",
    })
    expect(
      cronTaskPolicies.filter(
        (policy) => policy.concurrencyGroup === approved[0]?.concurrencyGroup,
      ),
    ).toHaveLength(1)
    expect(
      resolveCronRuntimeAuthority({
        CRON_SCHEDULER_MODE: "canary",
        CRON_LEDGER_CANARY_TASK_PATH: APPROVED_CRON_CANARY_TASK_PATH,
      }),
    ).toEqual({
      mode: "canary",
      canaryTaskPath: APPROVED_CRON_CANARY_TASK_PATH,
      ledgerTaskPaths: [APPROVED_CRON_CANARY_TASK_PATH],
    })
  })

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
