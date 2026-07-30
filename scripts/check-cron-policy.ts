import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

import { CronExpressionParser } from "cron-parser"

import {
  allCronPoliciesApproved,
  cronTaskPolicies,
  validateCronTaskPolicies,
  type CronTaskPolicy,
} from "../lib/cron-policy"
import { deriveCronPolicyBackfill, readCronScheduleInventory } from "./lib/cron-policy-inventory"

const repositoryRoot = resolve(import.meta.dirname, "..")
const arguments_ = process.argv.slice(2)
const requireApproved = arguments_.includes("--require-approved")
const errors = arguments_
  .filter((argument) => argument !== "--require-approved")
  .map((argument) => `unknown argument: ${argument}`)
errors.push(...validateCronTaskPolicies())
const inventory = await readCronScheduleInventory(repositoryRoot)
const policyBackfill = deriveCronPolicyBackfill(
  await readFile(resolve(repositoryRoot, "drizzle/migrations/0058_cron_job_ledger.sql"), "utf8"),
)
const policies: readonly CronTaskPolicy[] = cronTaskPolicies
const policiesByPath = new Map<string, CronTaskPolicy>(
  policies.map((policy) => [policy.path, policy]),
)

for (const policy of policies) {
  try {
    CronExpressionParser.parse(policy.expectedCronExpression, { tz: "UTC" })
  } catch (error) {
    errors.push(
      `${policy.path}: invalid cron expression (${error instanceof Error ? error.message : String(error)})`,
    )
  }

  const migrationExpression = inventory.migrationSchedules.get(policy.path)
  if (migrationExpression === undefined) {
    errors.push(`${policy.path}: missing from final migration schedule inventory`)
  } else if (migrationExpression !== policy.expectedCronExpression) {
    errors.push(
      `${policy.path}: policy expression "${policy.expectedCronExpression}" differs from migrations "${migrationExpression}"`,
    )
  }
  if (!inventory.routePaths.has(policy.path)) {
    errors.push(`${policy.path}: route.ts is missing`)
  }

  const backfill = policyBackfill.get(policy.path)
  if (!backfill) {
    errors.push(`${policy.path}: missing from migration 0058 policy backfill`)
  } else {
    const expected = {
      misfirePolicy: policy.misfirePolicy,
      maxCatchUpMinutes: policy.maxCatchUpMinutes,
      retryPolicy: policy.retryPolicy,
      maxAttempts: policy.maxAttempts,
      concurrencyGroup: policy.concurrencyGroup,
      idempotencyClass: policy.idempotency,
      requiresScheduledFor: policy.requiresScheduledFor,
    }
    for (const [field, expectedValue] of Object.entries(expected)) {
      const actualValue = backfill[field as keyof typeof backfill]
      if (actualValue !== expectedValue) {
        errors.push(
          `${policy.path}: migration 0058 ${field}=${JSON.stringify(actualValue)} differs from policy ${JSON.stringify(expectedValue)}`,
        )
      }
    }
  }
}

for (const path of inventory.migrationSchedules.keys()) {
  if (!policiesByPath.has(path)) {
    errors.push(`${path}: migration schedule has no policy entry`)
  }
}
for (const path of inventory.routePaths) {
  if (!policiesByPath.has(path)) {
    errors.push(`${path}: route has no policy entry`)
  }
}
for (const path of policyBackfill.keys()) {
  if (!policiesByPath.has(path)) {
    errors.push(`${path}: migration 0058 policy backfill has no policy entry`)
  }
}

if (requireApproved && !allCronPoliciesApproved()) {
  const proposed = policies.filter((policy) => policy.decision !== "approved")
  errors.push(`${proposed.length} cron policies are not approved`)
}

if (errors.length > 0) {
  console.error("Cron policy check failed:")
  for (const error of errors) console.error(`- ${error}`)
  process.exitCode = 1
} else {
  const suffix = requireApproved ? " and approved" : ""
  console.log(`Cron policy check passed: ${policies.length} tasks are structurally valid${suffix}.`)
}
