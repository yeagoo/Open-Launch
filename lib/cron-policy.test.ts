import { describe, expect, it } from "vitest"

import {
  deriveCronPolicyBackfill,
  deriveCronSchedulesFromSqlFiles,
} from "../scripts/lib/cron-policy-inventory"
import {
  allCronPoliciesApproved,
  APPROVED_CRON_CANARY_TASK_PATH,
  cronTaskPolicies,
  validateCronTaskPolicies,
  type CronTaskPolicy,
} from "./cron-policy"

describe("cron task policy", () => {
  it("contains 22 valid tasks and only the reviewed syndication canary is approved", () => {
    expect(cronTaskPolicies).toHaveLength(22)
    expect(validateCronTaskPolicies()).toEqual([])
    expect(new Set(cronTaskPolicies.map((policy) => policy.path)).size).toBe(22)
    expect(
      cronTaskPolicies
        .filter((policy) => policy.decision === "approved")
        .map((policy) => policy.path),
    ).toEqual([APPROVED_CRON_CANARY_TASK_PATH])
    expect(cronTaskPolicies.filter((policy) => policy.decision === "proposed")).toHaveLength(21)
    expect(allCronPoliciesApproved()).toBe(false)
    expect(allCronPoliciesApproved([])).toBe(false)
  })

  it("rejects invalid catch-up and duplicate path settings", () => {
    const invalid = [
      cronTaskPolicies[0],
      {
        ...cronTaskPolicies[0],
        misfirePolicy: "skip",
        maxCatchUpMinutes: 1,
        maxAttempts: 0,
      },
    ] satisfies readonly CronTaskPolicy[]

    expect(validateCronTaskPolicies(invalid)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("duplicate policy path"),
        expect.stringContaining("maxAttempts"),
        expect.stringContaining("skip policy"),
      ]),
    )
  })
})

describe("cron migration inventory", () => {
  it("applies inserts, updates, and deletes in caller-supplied migration order", () => {
    const schedules = deriveCronSchedulesFromSqlFiles([
      {
        name: "legacy-first.sql",
        sql: `
          INSERT INTO "cron_schedule" (path, display_name, cron_expression, enabled)
          VALUES
            ('/api/cron/example', 'What''s -- safe; still one statement', '0 * * * *', true),
            ('/api/cron/removed', 'Removed', '0 0 * * *', true);
        `,
      },
      {
        name: "0002.sql",
        sql: `
          -- ('/api/cron/comment-only', 'Ignore me', '* * * * *', true)
          /* ('/api/cron/block-comment-only', 'Ignore me', '* * * * *', true) */
          INSERT INTO "another_table" (path, display_name, cron_expression, enabled)
          VALUES ('/api/cron/not-a-schedule', 'Ignore me', '* * * * *', true);
          UPDATE "cron_schedule"
          SET "cron_expression" = '5 * * * *', "updated_at" = now()
          WHERE "path" = '/api/cron/example';
          DELETE FROM "cron_schedule" WHERE "path" = '/api/cron/removed';
        `,
      },
    ])

    expect([...schedules]).toEqual([["/api/cron/example", "5 * * * *"]])
  })

  it("extracts the Phase 1 policy backfill fields", () => {
    const policies = deriveCronPolicyBackfill(`
      VALUES
        ('/api/cron/example', 'latest', 60, 'transient-bounded', 2, 'external', 'strict', true)
    `)
    expect(policies.get("/api/cron/example")).toEqual({
      misfirePolicy: "latest",
      maxCatchUpMinutes: 60,
      retryPolicy: "transient-bounded",
      maxAttempts: 2,
      concurrencyGroup: "external",
      idempotencyClass: "strict",
      requiresScheduledFor: true,
    })
  })
})
