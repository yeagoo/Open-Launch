import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

import { Client } from "pg"

import { cronTaskPolicies } from "../lib/cron-policy"

const connectionString = process.env.CRON_LEDGER_TEST_DATABASE_URL
if (!connectionString) {
  throw new Error("CRON_LEDGER_TEST_DATABASE_URL is required")
}
const target = new URL(connectionString)
const databaseName = target.pathname.replace(/^\//, "")
if (
  !["127.0.0.1", "localhost", "::1", "[::1]"].includes(target.hostname) ||
  !databaseName.startsWith("open_launch_cron_test")
) {
  throw new Error(
    "Refusing migration test: target must be a loopback database named open_launch_cron_test*",
  )
}

const schemaName = `cron_ledger_test_${process.pid}_${crypto.randomUUID().replaceAll("-", "")}`
const client = new Client({ connectionString })
await client.connect()

try {
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
  for (const policy of cronTaskPolicies) {
    await client.query(
      `INSERT INTO "cron_schedule"
        (path, display_name, cron_expression, enabled, updated_at)
       VALUES ($1, $2, $3, true, '2026-07-01T00:00:00Z')`,
      [policy.path, policy.path, policy.expectedCronExpression],
    )
  }

  const migration = await readFile(
    resolve(import.meta.dirname, "../drizzle/migrations/0058_cron_job_ledger.sql"),
    "utf8",
  )
  for (const statement of migration
    .split(/-->\s*statement-breakpoint/)
    .map((value) => value.trim())
    .filter(Boolean)) {
    await client.query(statement)
  }

  const policyCount = await scalar(
    `SELECT count(*)::int
     FROM "cron_schedule"
     WHERE misfire_policy IS NOT NULL
       AND max_catch_up_minutes IS NOT NULL
       AND retry_policy IS NOT NULL
       AND max_attempts IS NOT NULL
       AND concurrency_group IS NOT NULL
       AND idempotency_class IS NOT NULL
       AND requires_scheduled_for IS NOT NULL`,
  )
  assert(policyCount === 22, `expected 22 backfilled schedules, received ${policyCount}`)

  const policy = cronTaskPolicies[0]
  const values = [
    policy.path,
    "2026-07-29T00:00:00.000Z",
    policy.expectedCronExpression,
    policy.misfirePolicy,
    policy.maxCatchUpMinutes,
    policy.retryPolicy,
    policy.maxAttempts,
    policy.concurrencyGroup,
    policy.idempotency,
    policy.requiresScheduledFor,
  ]
  const insert = `
    INSERT INTO "cron_job" (
      task_path, scheduled_for, execution_mode, status, cron_expression,
      misfire_policy, max_catch_up_minutes, retry_policy, max_attempts,
      concurrency_group, idempotency_class, requires_scheduled_for,
      schedule_version
    ) VALUES ($1, $2, 'ledger', 'pending', $3, $4, $5, $6, $7, $8, $9, $10, 'v1')
    ON CONFLICT (task_path, scheduled_for) DO NOTHING
  `
  const first = await client.query(insert, values)
  const duplicate = await client.query(insert, values)
  assert(first.rowCount === 1, "first cron job insert did not create one row")
  assert(duplicate.rowCount === 0, "duplicate task window was not absorbed")

  await expectConstraintFailure(
    client.query(
      `INSERT INTO "cron_job" (
        task_path, scheduled_for, execution_mode, status, cron_expression,
        misfire_policy, max_catch_up_minutes, retry_policy, max_attempts,
        concurrency_group, idempotency_class, requires_scheduled_for,
        schedule_version
      ) VALUES (
        '/api/cron/test-running', '2026-07-29T00:01:00Z', 'ledger', 'running',
        '* * * * *', 'latest', 60, 'transient-bounded', 2, 'test', 'strict', false, 'v1'
      )`,
    ),
    "running job without a lease was accepted",
  )
  await expectConstraintFailure(
    client.query(
      `INSERT INTO "cron_materialization_cursor" (id, scanned_through)
       VALUES ('main', '2026-07-29T00:00:30Z')`,
    ),
    "non-minute cursor was accepted",
  )

  console.log("Cron ledger migration test passed: policy backfill, uniqueness, and constraints.")
} finally {
  await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`)
  await client.end()
}

async function scalar(query: string): Promise<number> {
  const result = await client.query<{ count: number }>(query)
  return Number(result.rows[0]?.count ?? 0)
}

async function expectConstraintFailure(
  operation: Promise<unknown>,
  failureMessage: string,
): Promise<void> {
  try {
    await operation
  } catch {
    return
  }
  throw new Error(failureMessage)
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message)
}
