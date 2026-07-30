#!/usr/bin/env bun
import { Client } from "pg"

import {
  evaluateCronCutoverReadiness,
  type CronCutoverSnapshot,
  type CronCutoverTarget,
  type CronScheduleSnapshot,
} from "@/lib/cron-cutover-readiness"

const args = parseArguments(process.argv.slice(2))
const databaseUrl = process.env.DATABASE_URL?.trim()
if (!databaseUrl) throw new Error("DATABASE_URL is required")

const client = new Client({ connectionString: databaseUrl })
await client.connect()
try {
  await client.query("BEGIN TRANSACTION READ ONLY")
  await client.query("SET LOCAL statement_timeout = '10s'")
  await client.query("SET LOCAL TIME ZONE 'UTC'")
  const snapshot = await readSnapshot(client, args.checkedAt, args.canaryTaskPath)
  const result = evaluateCronCutoverReadiness({
    target: args.target,
    canaryTaskPath: args.canaryTaskPath,
    snapshot,
  })
  await client.query("COMMIT")
  console.log(JSON.stringify({ ...result, snapshot }, null, 2))
  if (!result.ready) process.exitCode = 1
} catch (error) {
  await client.query("ROLLBACK").catch(() => {})
  throw error
} finally {
  await client.end()
}

async function readSnapshot(
  database: Client,
  checkedAt: Date,
  canaryTaskPath: string | undefined,
): Promise<CronCutoverSnapshot> {
  const schedules = await database.query<CronScheduleSnapshot>(`
    SELECT
      path,
      enabled,
      cron_expression AS "cronExpression",
      misfire_policy AS "misfirePolicy",
      max_catch_up_minutes AS "maxCatchUpMinutes",
      retry_policy AS "retryPolicy",
      max_attempts AS "maxAttempts",
      concurrency_group AS "concurrencyGroup",
      idempotency_class AS "idempotencyClass",
      requires_scheduled_for AS "requiresScheduledFor"
    FROM cron_schedule
    ORDER BY path
  `)
  const cursor = await database.query<{ scannedThrough: Date; createdAt: Date }>(`
    SELECT scanned_through AS "scannedThrough", created_at AS "createdAt"
    FROM cron_materialization_cursor
    WHERE id = 'main'
  `)
  const activeLedgerJobs = await database.query<{
    taskPath: string
    status: string
    count: number
  }>(`
    SELECT task_path AS "taskPath", status, count(*)::int AS count
    FROM cron_job
    WHERE execution_mode = 'ledger'
      AND status IN ('pending', 'running', 'retry_wait', 'uncertain', 'dead_lettered')
    GROUP BY task_path, status
    ORDER BY task_path, status
  `)
  const comparisonStart = new Date(checkedAt.getTime() - 48 * 60 * 60 * 1_000)
  const shadow = await database.query<{
    shadowWindows: number
    matchedWindows: number
    missingLegacyWindows: number
    extraLegacyWindows: number
  }>(
    `
      WITH shadow AS (
        SELECT task_path, scheduled_for AS minute
        FROM cron_job
        WHERE execution_mode = 'shadow'
          AND scheduled_for >= $1
          AND scheduled_for < $2
      ),
      legacy AS (
        SELECT
          task_path,
          date_trunc('minute', dispatched_at AT TIME ZONE 'UTC') AS minute
        FROM cron_run_log
        WHERE dispatched_at >= ($1 AT TIME ZONE 'UTC')
          AND dispatched_at < ($2 AT TIME ZONE 'UTC')
        GROUP BY task_path, date_trunc('minute', dispatched_at AT TIME ZONE 'UTC')
      ),
      compared AS (
        SELECT
          shadow.task_path AS shadow_path,
          legacy.task_path AS legacy_path
        FROM shadow
        FULL OUTER JOIN legacy
          ON legacy.task_path = shadow.task_path
         AND legacy.minute = shadow.minute
      )
      SELECT
        count(*) FILTER (WHERE shadow_path IS NOT NULL)::int AS "shadowWindows",
        count(*) FILTER (WHERE shadow_path IS NOT NULL AND legacy_path IS NOT NULL)::int
          AS "matchedWindows",
        count(*) FILTER (WHERE shadow_path IS NOT NULL AND legacy_path IS NULL)::int
          AS "missingLegacyWindows",
        count(*) FILTER (WHERE shadow_path IS NULL AND legacy_path IS NOT NULL)::int
          AS "extraLegacyWindows"
      FROM compared
    `,
    [comparisonStart, checkedAt],
  )

  let canary: CronCutoverSnapshot["canary"] = null
  if (canaryTaskPath) {
    const canaryResult = await database.query<NonNullable<CronCutoverSnapshot["canary"]>>(
      `
        SELECT
          $1::text AS "taskPath",
          min(created_at) AS "firstCreatedAt",
          count(*) FILTER (
            WHERE scheduled_for >= $2 AND status = 'succeeded'
          )::int AS succeeded,
          count(*) FILTER (
            WHERE scheduled_for >= $2
              AND (
                status IN ('cancelled', 'retry_wait', 'uncertain', 'dead_lettered')
                OR status_code = 0
                OR status_code >= 400
              )
          )::int AS failed,
          count(*) FILTER (
            WHERE scheduled_for >= $2 AND status = 'uncertain'
          )::int AS uncertain,
          count(*) FILTER (
            WHERE scheduled_for >= $2 AND status = 'dead_lettered'
          )::int AS "deadLettered"
        FROM cron_job
        WHERE execution_mode = 'ledger'
          AND task_path = $1
          AND scheduled_for < $3
      `,
      [canaryTaskPath, comparisonStart, checkedAt],
    )
    const row = canaryResult.rows[0]
    const canaryWindows = await database.query<{ scheduledFor: Date }>(
      `
        SELECT scheduled_for AS "scheduledFor"
        FROM cron_job
        WHERE execution_mode = 'ledger'
          AND task_path = $1
          AND scheduled_for >= $2
          AND scheduled_for < $3
        ORDER BY scheduled_for
      `,
      [canaryTaskPath, comparisonStart, checkedAt],
    )
    canary = row
      ? {
          ...row,
          scheduledFor: canaryWindows.rows.map((window) => window.scheduledFor),
          succeeded: Number(row.succeeded),
          failed: Number(row.failed),
          uncertain: Number(row.uncertain),
          deadLettered: Number(row.deadLettered),
        }
      : null
  }

  return {
    checkedAt,
    schedules: schedules.rows,
    cursor: cursor.rows[0] ?? null,
    activeLedgerJobs: activeLedgerJobs.rows.map((row) => ({ ...row, count: Number(row.count) })),
    shadow: shadow.rows[0] ?? {
      shadowWindows: 0,
      matchedWindows: 0,
      missingLegacyWindows: 0,
      extraLegacyWindows: 0,
    },
    canary,
  }
}

function parseArguments(argv: string[]): {
  target: CronCutoverTarget
  canaryTaskPath?: string
  checkedAt: Date
} {
  let target: CronCutoverTarget | undefined
  let canaryTaskPath: string | undefined
  let checkedAt = new Date()
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    const value = argv[++index]
    if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value`)
    if (argument === "--target") {
      if (value !== "shadow" && value !== "canary" && value !== "ledger") {
        throw new Error("--target must be shadow, canary, or ledger")
      }
      target = value
    } else if (argument === "--canary-task") {
      canaryTaskPath = value
    } else if (argument === "--at") {
      checkedAt = new Date(value)
      if (!Number.isFinite(checkedAt.getTime()) || checkedAt.toISOString() !== value) {
        throw new Error("--at must be a canonical ISO timestamp")
      }
    } else {
      throw new Error(`Unknown argument: ${argument}`)
    }
  }
  if (!target) throw new Error("--target is required")
  if ((target === "canary" || target === "ledger") && !canaryTaskPath) {
    throw new Error(`--canary-task is required for target ${target}`)
  }
  return { target, canaryTaskPath, checkedAt }
}
