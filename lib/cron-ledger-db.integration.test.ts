import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

import { Client } from "pg"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

const connectionString = process.env.CRON_LEDGER_TEST_DATABASE_URL
const describeDatabase = connectionString ? describe : describe.skip

describeDatabase("cron ledger observability query", () => {
  const schemaName = `cron_metrics_${process.pid}_${crypto.randomUUID().replaceAll("-", "")}`
  const originalDatabaseUrl = process.env.DATABASE_URL
  let client: Client
  let closeDatabasePool: (() => Promise<void>) | undefined
  let cleanupCronLogs:
    ((request: import("next/server").NextRequest) => Promise<Response>) | undefined
  let cronLedgerBacklogSummary:
    | ((now?: Date) => Promise<{
        pending: number
        running: number
        retryWait: number
        uncertain: number
        deadLettered: number
        oldestPendingSeconds: number | null
        materializationLagSeconds: number | null
        taskDurationP50Ms: number | null
        taskDurationP95Ms: number | null
        scheduledToStartP50Ms: number | null
        scheduledToStartP95Ms: number | null
      }>)
    | undefined
  let materializeCronLedger:
    | ((
        mode: "shadow" | "ledger",
        now?: Date,
        options?: { allowedTaskPaths?: readonly string[] },
      ) => Promise<unknown>)
    | undefined
  let claimCronJob:
    | ((input?: {
        workerId?: string
        now?: Date
        leaseMs?: number
        allowedTaskPaths?: readonly string[]
      }) => Promise<{ id: string; taskPath: string; leaseToken: string } | null>)
    | undefined
  let recoverExpiredCronLeases:
    | ((
        now?: Date,
        allowedTaskPaths?: readonly string[],
      ) => Promise<{ recovered: number; uncertain: number; deadLettered: number }>)
    | undefined

  beforeAll(async () => {
    if (!connectionString) return
    const target = new URL(connectionString)
    const databaseName = target.pathname.replace(/^\//, "")
    if (
      !["127.0.0.1", "localhost", "::1", "[::1]"].includes(target.hostname) ||
      !databaseName.startsWith("open_launch_cron_test")
    ) {
      throw new Error(
        "Refusing cron metrics test: target must be loopback and named open_launch_cron_test*",
      )
    }

    client = new Client({ connectionString })
    await client.connect()
    await client.query(`CREATE SCHEMA "${schemaName}"`)
    await client.query(`SET search_path TO "${schemaName}", public`)
    await client.query(`
      CREATE TABLE "cron_schedule" (
        "id" serial PRIMARY KEY,
        "path" text NOT NULL UNIQUE,
        "display_name" text NOT NULL,
        "cron_expression" text NOT NULL,
        "enabled" boolean NOT NULL DEFAULT true,
        "expected_duration_ms" integer,
        "description" text,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now()
      )
    `)
    await client.query(`
      CREATE TABLE "cron_run_log" (
        "id" serial PRIMARY KEY,
        "dispatched_at" timestamp NOT NULL DEFAULT now(),
        "task_path" text NOT NULL,
        "status_code" integer NOT NULL,
        "duration_ms" integer NOT NULL,
        "error" text
      )
    `)

    for (const migrationName of [
      "0058_cron_job_ledger.sql",
      "0059_cron_materialization_audit.sql",
    ]) {
      const migration = await readFile(
        resolve(process.cwd(), `drizzle/migrations/${migrationName}`),
        "utf8",
      )
      for (const statement of migration
        .split(/-->\s*statement-breakpoint/)
        .map((value) => value.trim())
        .filter(Boolean)) {
        await client.query(statement)
      }
    }

    await client.query(`
      INSERT INTO cron_materialization_cursor (id, scanned_through)
      VALUES ('main', '2026-07-30T00:08:00Z')
    `)
    await client.query(`
      INSERT INTO cron_job (
        task_path, scheduled_for, execution_mode, status, attempt_count,
        available_at, started_at, finished_at, status_code, duration_ms,
        cron_expression, misfire_policy, max_catch_up_minutes, retry_policy,
        max_attempts, concurrency_group, idempotency_class,
        requires_scheduled_for, schedule_version
      ) VALUES
      (
        '/api/cron/test-a', '2026-07-30T00:08:00Z', 'ledger', 'succeeded', 1,
        '2026-07-30T00:08:00Z', '2026-07-30T00:08:10Z',
        '2026-07-30T00:09:00Z', 200, 100, '* * * * *', 'latest', 60,
        'none', 1, 'test-a', 'strict', false, 'v1'
      ),
      (
        '/api/cron/test-b', '2026-07-30T00:08:00Z', 'ledger', 'succeeded', 1,
        '2026-07-30T00:08:00Z', '2026-07-30T00:08:30Z',
        '2026-07-30T00:09:30Z', 200, 900, '* * * * *', 'latest', 60,
        'none', 1, 'test-b', 'strict', false, 'v1'
      )
    `)

    const applicationUrl = new URL(connectionString)
    applicationUrl.searchParams.set("options", `-c search_path=${schemaName},public`)
    process.env.DATABASE_URL = applicationUrl.toString()
    const ledger = await import("@/lib/cron-ledger-db")
    cronLedgerBacklogSummary = ledger.cronLedgerBacklogSummary
    materializeCronLedger = ledger.materializeCronLedger
    claimCronJob = ledger.claimCronJob
    recoverExpiredCronLeases = ledger.recoverExpiredCronLeases
    cleanupCronLogs = (await import("@/app/api/cron/cron-log-cleanup/route")).GET
    closeDatabasePool = (await import("@/drizzle/db")).closeDatabasePool
  })

  afterAll(async () => {
    await closeDatabasePool?.()
    if (client) {
      await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`)
      await client.end()
    }
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL
    else process.env.DATABASE_URL = originalDatabaseUrl
  })

  it("returns queue, lag and 24-hour latency percentiles", async () => {
    if (!cronLedgerBacklogSummary) throw new Error("cron metrics query was not initialized")
    const summary = await cronLedgerBacklogSummary(new Date("2026-07-30T00:10:00Z"))

    expect(summary).toMatchObject({
      pending: 0,
      running: 0,
      retryWait: 0,
      uncertain: 0,
      deadLettered: 0,
      oldestPendingSeconds: null,
      materializationLagSeconds: 120,
      taskDurationP50Ms: 500,
      taskDurationP95Ms: 860,
      scheduledToStartP50Ms: 20_000,
      scheduledToStartP95Ms: 29_000,
    })
  })

  it("materializes, claims, and recovers only the canary allowlist", async () => {
    if (!materializeCronLedger || !claimCronJob || !recoverExpiredCronLeases) {
      throw new Error("cron ledger functions were not initialized")
    }
    const canaryPath = "/api/cron/test-canary"
    const legacyPath = "/api/cron/test-legacy"
    const leaseToken = crypto.randomUUID()
    try {
      await client.query(
        `
          INSERT INTO cron_schedule (
            path, display_name, cron_expression, enabled, updated_at,
            misfire_policy, max_catch_up_minutes, retry_policy, max_attempts,
            concurrency_group, idempotency_class, requires_scheduled_for
          ) VALUES
            ($1, 'Canary', '* * * * *', true, '2026-07-29T00:00:00Z',
              'latest', 60, 'transient-bounded', 2, 'canary-group', 'strict', false),
            ($2, 'Legacy', '* * * * *', true, '2026-07-29T00:00:00Z',
              'latest', 60, 'transient-bounded', 2, 'legacy-group', 'strict', false)
        `,
        [canaryPath, legacyPath],
      )

      const firstMaterialization = await materializeCronLedger(
        "shadow",
        new Date("2026-07-30T00:10:30Z"),
        {
          allowedTaskPaths: [canaryPath],
        },
      )
      expect(firstMaterialization).toMatchObject({ cursorAdvanced: true })
      const repeatedMaterialization = await materializeCronLedger(
        "shadow",
        new Date("2026-07-30T00:10:59Z"),
        {
          allowedTaskPaths: [canaryPath],
        },
      )
      expect(repeatedMaterialization).toMatchObject({ cursorAdvanced: false, plannedCount: 0 })
      const auditRows = await client.query<{
        task_path: string
        scanned_from: Date
        scanned_through: Date
      }>(
        `SELECT task_path, scanned_from, scanned_through
         FROM cron_materialization_run
         WHERE task_path = $1`,
        [canaryPath],
      )
      expect(auditRows.rowCount).toBe(1)
      expect(auditRows.rows[0]).toMatchObject({ task_path: canaryPath })

      await client.query(
        `INSERT INTO cron_materialization_run (
          execution_mode, scope_kind, task_path, scanned_from, scanned_through,
          planned_count, inserted_count, policy_fingerprint
        ) VALUES ('shadow', 'task', $1, '2026-07-30T00:11:00Z',
          '2026-07-30T00:11:00Z', 0, 0, $2)`,
        [canaryPath, "a".repeat(64)],
      )
      await expect(
        materializeCronLedger("shadow", new Date("2026-07-30T00:11:30Z"), {
          allowedTaskPaths: [canaryPath],
        }),
      ).rejects.toThrow()
      const rolledBack = await client.query<{ count: number }>(
        `SELECT count(*)::int AS count
         FROM cron_job
         WHERE task_path = $1 AND scheduled_for = '2026-07-30T00:11:00Z'`,
        [canaryPath],
      )
      expect(rolledBack.rows[0]?.count).toBe(0)
      const cursorAfterRollback = await client.query<{ scanned_through: Date }>(
        `SELECT scanned_through FROM cron_materialization_cursor WHERE id = 'main'`,
      )
      expect(cursorAfterRollback.rows[0]?.scanned_through.toISOString()).toBe(
        "2026-07-30T00:10:00.000Z",
      )
      await client.query(
        `DELETE FROM cron_materialization_run
         WHERE task_path = $1 AND scanned_through = '2026-07-30T00:11:00Z'`,
        [canaryPath],
      )
      const materialized = await client.query<{ task_path: string }>(
        `SELECT task_path FROM cron_job WHERE task_path IN ($1, $2) ORDER BY task_path`,
        [canaryPath, legacyPath],
      )
      expect(materialized.rows.map((row) => row.task_path)).toEqual([canaryPath])
      await client.query(
        `
          UPDATE cron_job
          SET execution_mode = 'ledger', status = 'pending', finished_at = NULL
          WHERE task_path = $1
        `,
        [canaryPath],
      )

      const claimed = await claimCronJob({
        workerId: "canary-test",
        now: new Date("2026-07-30T00:10:31Z"),
        leaseMs: 30_000,
        allowedTaskPaths: [canaryPath],
      })
      expect(claimed?.taskPath).toBe(canaryPath)

      await client.query(
        `
          INSERT INTO cron_job (
            task_path, scheduled_for, execution_mode, status, attempt_count,
            available_at, lease_owner, lease_token, lease_expires_at,
            cron_expression, misfire_policy, max_catch_up_minutes, retry_policy,
            max_attempts, concurrency_group, idempotency_class,
            requires_scheduled_for, schedule_version
          ) VALUES (
            $1, '2026-07-30T00:09:00Z', 'ledger', 'running', 1,
            '2026-07-30T00:09:00Z', 'other-worker', $2,
            '2026-07-30T00:10:00Z', '* * * * *', 'latest', 60,
            'transient-bounded', 2, 'legacy-group', 'strict', false, 'v1'
          )
        `,
        [legacyPath, leaseToken],
      )

      const recovery = await recoverExpiredCronLeases(new Date("2026-07-30T00:11:02Z"), [
        canaryPath,
      ])
      expect(recovery).toEqual({ recovered: 1, uncertain: 0, deadLettered: 0 })
      const legacyJob = await client.query<{ status: string }>(
        `SELECT status FROM cron_job WHERE task_path = $1`,
        [legacyPath],
      )
      expect(legacyJob.rows[0]?.status).toBe("running")
    } finally {
      await client.query(`DELETE FROM cron_job WHERE task_path IN ($1, $2)`, [
        canaryPath,
        legacyPath,
      ])
      await client.query(`DELETE FROM cron_schedule WHERE path IN ($1, $2)`, [
        canaryPath,
        legacyPath,
      ])
    }
  })

  it("retains 90 days of materialization audit history", async () => {
    if (!cleanupCronLogs) throw new Error("cron cleanup route was not initialized")
    const originalCronApiKey = process.env.CRON_API_KEY
    const originalSchedulerMode = process.env.CRON_SCHEDULER_MODE
    const oldScan = new Date("2026-04-01T00:00:00.000Z")
    const recentScan = new Date("2026-07-31T00:00:00.000Z")
    try {
      await client.query(
        `INSERT INTO cron_materialization_run (
          execution_mode, scope_kind, task_path, scanned_from, scanned_through,
          planned_count, inserted_count, policy_fingerprint, created_at
        ) VALUES
          ('shadow', 'all', NULL, $1, $1, 0, 0, $3, $1),
          ('shadow', 'all', NULL, $2, $2, 0, 0, $3, $2)`,
        [oldScan, recentScan, "c".repeat(64)],
      )
      process.env.CRON_API_KEY = "phase11b-cleanup-test"
      process.env.CRON_SCHEDULER_MODE = "legacy"
      const { NextRequest } = await import("next/server")
      const response = await cleanupCronLogs(
        new NextRequest("http://localhost/api/cron/cron-log-cleanup", {
          headers: { authorization: "Bearer phase11b-cleanup-test" },
        }),
      )
      expect(response.status).toBe(200)
      const payload = (await response.json()) as { deletedMaterializationRuns: number }
      expect(payload.deletedMaterializationRuns).toBeGreaterThanOrEqual(1)
      const retained = await client.query<{ scanned_through: Date }>(
        `SELECT scanned_through
         FROM cron_materialization_run
         WHERE scanned_through IN ($1, $2)
         ORDER BY scanned_through`,
        [oldScan, recentScan],
      )
      expect(retained.rows.map((row) => row.scanned_through.toISOString())).toEqual([
        recentScan.toISOString(),
      ])
    } finally {
      await client.query(`DELETE FROM cron_materialization_run WHERE scanned_through IN ($1, $2)`, [
        oldScan,
        recentScan,
      ])
      if (originalCronApiKey === undefined) delete process.env.CRON_API_KEY
      else process.env.CRON_API_KEY = originalCronApiKey
      if (originalSchedulerMode === undefined) delete process.env.CRON_SCHEDULER_MODE
      else process.env.CRON_SCHEDULER_MODE = originalSchedulerMode
    }
  })
})
