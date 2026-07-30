export type CronPolicyDecision = "proposed" | "approved" | "rejected"

export type CronMisfirePolicy = "skip" | "latest"

export type CronIdempotencyClass = "strict" | "guarded" | "convergent" | "non-idempotent"

export type CronRetryPolicy = "none" | "next-schedule" | "transient-bounded" | "handler-managed"

export type CronSideEffect =
  | "database"
  | "email"
  | "external-ai"
  | "external-crawl"
  | "external-http"
  | "object-storage"
  | "redis"
  | "stripe"

export interface CronTaskPolicy {
  path: `/api/cron/${string}`
  expectedCronExpression: string
  idempotency: CronIdempotencyClass
  misfirePolicy: CronMisfirePolicy
  maxCatchUpMinutes: number
  retryPolicy: CronRetryPolicy
  maxAttempts: number
  concurrencyGroup: string
  sideEffects: readonly CronSideEffect[]
  requiresScheduledFor: boolean
  decision: CronPolicyDecision
  rationale: string
}

export const APPROVED_CRON_CANARY_TASK_PATH = "/api/cron/syndicate-launches" as const

/**
 * Phase 0 proposal only. The dispatcher must not enforce these values until every
 * entry has been reviewed and its decision changed to "approved".
 */
export const cronTaskPolicies = [
  {
    path: "/api/cron/cron-health",
    expectedCronExpression: "*/30 * * * *",
    idempotency: "guarded",
    misfirePolicy: "latest",
    maxCatchUpMinutes: 60,
    retryPolicy: "next-schedule",
    maxAttempts: 1,
    concurrencyGroup: "monitoring",
    sideEffects: ["database", "email"],
    requiresScheduledFor: false,
    decision: "proposed",
    rationale:
      "Current-state monitor with persisted alert de-duplication; old windows add no value.",
  },
  {
    path: "/api/cron/cron-log-cleanup",
    expectedCronExpression: "15 0 * * *",
    idempotency: "convergent",
    misfirePolicy: "latest",
    maxCatchUpMinutes: 1440,
    retryPolicy: "transient-bounded",
    maxAttempts: 2,
    concurrencyGroup: "maintenance",
    sideEffects: ["database"],
    requiresScheduledFor: false,
    decision: "proposed",
    rationale: "Repeated retention deletes converge on the same 90-day boundary.",
  },
  {
    path: "/api/cron/db-backup",
    expectedCronExpression: "0 2 */3 * *",
    idempotency: "non-idempotent",
    misfirePolicy: "latest",
    maxCatchUpMinutes: 7200,
    retryPolicy: "transient-bounded",
    maxAttempts: 2,
    concurrencyGroup: "backup",
    sideEffects: ["database", "object-storage", "external-http"],
    requiresScheduledFor: false,
    decision: "proposed",
    rationale:
      "Each invocation creates a timestamped backup object, so only one recovery run is useful.",
  },
  {
    path: "/api/cron/drain-email-outbox",
    expectedCronExpression: "*/10 * * * *",
    idempotency: "strict",
    misfirePolicy: "latest",
    maxCatchUpMinutes: 60,
    retryPolicy: "handler-managed",
    maxAttempts: 1,
    concurrencyGroup: "email",
    sideEffects: ["database", "email", "external-http"],
    requiresScheduledFor: false,
    decision: "proposed",
    rationale: "Durable event keys and provider idempotency make a single latest drain sufficient.",
  },
  {
    path: "/api/cron/enrich-projects",
    expectedCronExpression: "*/5 0,4,5,10-23 * * *",
    idempotency: "guarded",
    misfirePolicy: "latest",
    maxCatchUpMinutes: 60,
    retryPolicy: "next-schedule",
    maxAttempts: 1,
    concurrencyGroup: "deepseek",
    sideEffects: ["database", "external-ai", "external-crawl"],
    requiresScheduledFor: false,
    decision: "proposed",
    rationale:
      "CAS protects writes, but overlap can duplicate paid crawl/AI work and failure counters.",
  },
  {
    path: "/api/cron/generate-alternatives",
    expectedCronExpression: "5,35 0,4,5,10-23 * * *",
    idempotency: "convergent",
    misfirePolicy: "latest",
    maxCatchUpMinutes: 720,
    retryPolicy: "next-schedule",
    maxAttempts: 1,
    concurrencyGroup: "deepseek",
    sideEffects: ["database", "external-ai", "external-crawl"],
    requiresScheduledFor: false,
    decision: "proposed",
    rationale: "Unique records converge, while overlap still duplicates external work and cost.",
  },
  {
    path: "/api/cron/generate-blog-recap",
    expectedCronExpression: "0 0 1 * *",
    idempotency: "convergent",
    misfirePolicy: "latest",
    maxCatchUpMinutes: 43200,
    retryPolicy: "transient-bounded",
    maxAttempts: 2,
    concurrencyGroup: "deepseek",
    sideEffects: ["database", "external-ai"],
    requiresScheduledFor: true,
    decision: "proposed",
    rationale: "The month must come from the scheduled window before historical recovery is safe.",
  },
  {
    path: "/api/cron/generate-blog-roundup",
    expectedCronExpression: "0 12 * * 1",
    idempotency: "guarded",
    misfirePolicy: "latest",
    maxCatchUpMinutes: 10080,
    retryPolicy: "transient-bounded",
    maxAttempts: 2,
    concurrencyGroup: "deepseek",
    sideEffects: ["database", "external-ai"],
    requiresScheduledFor: false,
    decision: "proposed",
    rationale:
      "Each call may draft the next category, so replaying every missed week would create a burst.",
  },
  {
    path: "/api/cron/generate-comparisons",
    expectedCronExpression: "15,45 0,4,5,10-23 * * *",
    idempotency: "convergent",
    misfirePolicy: "latest",
    maxCatchUpMinutes: 720,
    retryPolicy: "next-schedule",
    maxAttempts: 1,
    concurrencyGroup: "deepseek",
    sideEffects: ["database", "external-ai", "external-crawl"],
    requiresScheduledFor: false,
    decision: "proposed",
    rationale: "Unique records converge, while overlap still duplicates external work and cost.",
  },
  {
    path: "/api/cron/import-producthunt",
    expectedCronExpression: "0 0 * * *",
    idempotency: "guarded",
    misfirePolicy: "skip",
    maxCatchUpMinutes: 0,
    retryPolicy: "transient-bounded",
    maxAttempts: 2,
    concurrencyGroup: "producthunt",
    sideEffects: ["database", "external-http", "object-storage"],
    requiresScheduledFor: false,
    decision: "proposed",
    rationale:
      "The endpoint imports the current feed and cannot reconstruct a missed historical day.",
  },
  {
    path: "/api/cron/moderate-tags",
    expectedCronExpression: "0 0,12,15,18,21 * * *",
    idempotency: "guarded",
    misfirePolicy: "latest",
    maxCatchUpMinutes: 360,
    retryPolicy: "next-schedule",
    maxAttempts: 1,
    concurrencyGroup: "deepseek",
    sideEffects: ["database", "external-ai"],
    requiresScheduledFor: false,
    decision: "proposed",
    rationale: "Pending tags form a durable backlog, but the handler has no claim before AI work.",
  },
  {
    path: "/api/cron/quality-check-projects",
    expectedCronExpression: "*/5 0,4,5,10-23 * * *",
    idempotency: "guarded",
    misfirePolicy: "latest",
    maxCatchUpMinutes: 60,
    retryPolicy: "next-schedule",
    maxAttempts: 1,
    concurrencyGroup: "deepseek",
    sideEffects: ["database", "external-ai"],
    requiresScheduledFor: false,
    decision: "proposed",
    rationale:
      "Last-write-wins output converges, but overlap can duplicate AI work and failure cooldowns.",
  },
  {
    path: "/api/cron/relate-projects",
    expectedCronExpression: "*/5 0,4,5,10-23 * * *",
    idempotency: "guarded",
    misfirePolicy: "latest",
    maxCatchUpMinutes: 60,
    retryPolicy: "next-schedule",
    maxAttempts: 1,
    concurrencyGroup: "deepseek",
    sideEffects: ["database", "external-ai"],
    requiresScheduledFor: false,
    decision: "proposed",
    rationale:
      "Transaction and unique constraints protect results, but overlap repeats paid AI work.",
  },
  {
    path: "/api/cron/send-ongoing-reminders",
    expectedCronExpression: "5 8 * * *",
    idempotency: "strict",
    misfirePolicy: "latest",
    maxCatchUpMinutes: 2880,
    retryPolicy: "handler-managed",
    maxAttempts: 1,
    concurrencyGroup: "email",
    sideEffects: ["database", "email", "external-http"],
    requiresScheduledFor: false,
    decision: "proposed",
    rationale:
      "A two-day compensation window and stable event keys already recover missed reminders.",
  },
  {
    path: "/api/cron/send-winner-notifications",
    expectedCronExpression: "0 9 * * *",
    idempotency: "strict",
    misfirePolicy: "latest",
    maxCatchUpMinutes: 4320,
    retryPolicy: "handler-managed",
    maxAttempts: 1,
    concurrencyGroup: "email",
    sideEffects: ["database", "email", "external-http"],
    requiresScheduledFor: false,
    decision: "proposed",
    rationale:
      "A three-day compensation window and stable event keys already recover missed notices.",
  },
  {
    path: "/api/cron/simulate-engagement",
    expectedCronExpression: "0 0,4,10,12,14,16,18,20,22 * * *",
    idempotency: "guarded",
    misfirePolicy: "skip",
    maxCatchUpMinutes: 0,
    retryPolicy: "next-schedule",
    maxAttempts: 1,
    concurrencyGroup: "deepseek",
    sideEffects: ["database", "external-ai"],
    requiresScheduledFor: false,
    decision: "proposed",
    rationale:
      "Replaying historical ticks can create additional synthetic activity and rewrite comments.",
  },
  {
    path: "/api/cron/skill-publish",
    expectedCronExpression: "*/2 * * * *",
    idempotency: "guarded",
    misfirePolicy: "latest",
    maxCatchUpMinutes: 60,
    retryPolicy: "handler-managed",
    maxAttempts: 1,
    concurrencyGroup: "skill-publishing",
    sideEffects: ["database", "external-http", "redis"],
    requiresScheduledFor: false,
    decision: "proposed",
    rationale:
      "Receiver idempotency helps, but due rows are not claimed before the external request.",
  },
  {
    path: APPROVED_CRON_CANARY_TASK_PATH,
    expectedCronExpression: "*/2 * * * *",
    idempotency: "strict",
    misfirePolicy: "latest",
    maxCatchUpMinutes: 60,
    retryPolicy: "handler-managed",
    maxAttempts: 1,
    concurrencyGroup: "syndication",
    sideEffects: ["database", "external-http"],
    requiresScheduledFor: false,
    decision: "approved",
    rationale:
      "Approved for the first production canary: the durable queue uses a sending claim, stale reaper, unique key, and receiver de-duplication.",
  },
  {
    path: "/api/cron/translate-blog",
    expectedCronExpression: "0 0,4,5,10-23 * * *",
    idempotency: "convergent",
    misfirePolicy: "latest",
    maxCatchUpMinutes: 1440,
    retryPolicy: "next-schedule",
    maxAttempts: 1,
    concurrencyGroup: "deepseek",
    sideEffects: ["database", "external-ai"],
    requiresScheduledFor: false,
    decision: "proposed",
    rationale: "Missing locales remain a durable backlog and upserts converge.",
  },
  {
    path: "/api/cron/translate-projects",
    expectedCronExpression: "*/5 0,4,5,10-23 * * *",
    idempotency: "convergent",
    misfirePolicy: "latest",
    maxCatchUpMinutes: 60,
    retryPolicy: "next-schedule",
    maxAttempts: 1,
    concurrencyGroup: "deepseek",
    sideEffects: ["database", "external-ai"],
    requiresScheduledFor: false,
    decision: "proposed",
    rationale: "Missing locales remain a durable backlog and conflict-safe writes converge.",
  },
  {
    path: "/api/cron/update-launches",
    expectedCronExpression: "*/10 * * * *",
    idempotency: "convergent",
    misfirePolicy: "latest",
    maxCatchUpMinutes: 1440,
    retryPolicy: "transient-bounded",
    maxAttempts: 2,
    concurrencyGroup: "launch-state",
    sideEffects: ["database", "email", "external-http"],
    requiresScheduledFor: false,
    decision: "proposed",
    rationale:
      "The current-state reconciliation self-heals old launch states and de-duplicates notices.",
  },
  {
    path: "/api/cron/webhook-health",
    expectedCronExpression: "0 */6 * * *",
    idempotency: "non-idempotent",
    misfirePolicy: "latest",
    maxCatchUpMinutes: 360,
    retryPolicy: "transient-bounded",
    maxAttempts: 2,
    concurrencyGroup: "stripe-monitoring",
    sideEffects: ["database", "email", "stripe"],
    requiresScheduledFor: false,
    decision: "proposed",
    rationale:
      "Each invocation stores a health snapshot and may alert; historical snapshots are misleading.",
  },
] as const satisfies readonly CronTaskPolicy[]

export function validateCronTaskPolicies(
  policies: readonly CronTaskPolicy[] = cronTaskPolicies,
): string[] {
  const errors: string[] = []
  const paths = new Set<string>()

  for (const policy of policies) {
    if (paths.has(policy.path)) {
      errors.push(`duplicate policy path: ${policy.path}`)
    }
    paths.add(policy.path)

    if (!policy.expectedCronExpression.trim()) {
      errors.push(`${policy.path}: expectedCronExpression is empty`)
    }
    if (!Number.isInteger(policy.maxCatchUpMinutes) || policy.maxCatchUpMinutes < 0) {
      errors.push(`${policy.path}: maxCatchUpMinutes must be a non-negative integer`)
    }
    if (!Number.isInteger(policy.maxAttempts) || policy.maxAttempts < 1) {
      errors.push(`${policy.path}: maxAttempts must be a positive integer`)
    }
    if (policy.misfirePolicy === "skip" && policy.maxCatchUpMinutes !== 0) {
      errors.push(`${policy.path}: skip policy must have maxCatchUpMinutes=0`)
    }
    if (!policy.concurrencyGroup.trim()) {
      errors.push(`${policy.path}: concurrencyGroup is empty`)
    }
    if (!policy.rationale.trim()) {
      errors.push(`${policy.path}: rationale is empty`)
    }
  }

  return errors
}

export function allCronPoliciesApproved(
  policies: readonly CronTaskPolicy[] = cronTaskPolicies,
): boolean {
  return policies.length > 0 && policies.every((policy) => policy.decision === "approved")
}
