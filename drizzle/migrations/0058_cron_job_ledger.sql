-- Phase 1 persistent cron ledger. Runtime remains in legacy mode unless
-- CRON_SCHEDULER_MODE is explicitly changed. Shadow rows are materialized as
-- cancelled audit records; ledger execution additionally requires every
-- code policy to be approved.

ALTER TABLE "cron_schedule"
  ADD COLUMN IF NOT EXISTS "misfire_policy" text,
  ADD COLUMN IF NOT EXISTS "max_catch_up_minutes" integer,
  ADD COLUMN IF NOT EXISTS "retry_policy" text,
  ADD COLUMN IF NOT EXISTS "max_attempts" integer,
  ADD COLUMN IF NOT EXISTS "concurrency_group" text,
  ADD COLUMN IF NOT EXISTS "idempotency_class" text,
  ADD COLUMN IF NOT EXISTS "requires_scheduled_for" boolean;

--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cron_schedule_misfire_policy_check'
  ) THEN
    ALTER TABLE "cron_schedule"
      ADD CONSTRAINT "cron_schedule_misfire_policy_check"
      CHECK ("misfire_policy" IS NULL OR "misfire_policy" IN ('skip', 'latest', 'bounded-all'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cron_schedule_max_catch_up_check'
  ) THEN
    ALTER TABLE "cron_schedule"
      ADD CONSTRAINT "cron_schedule_max_catch_up_check"
      CHECK ("max_catch_up_minutes" IS NULL OR
        ("max_catch_up_minutes" >= 0 AND "max_catch_up_minutes" <= 43200));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cron_schedule_retry_policy_check'
  ) THEN
    ALTER TABLE "cron_schedule"
      ADD CONSTRAINT "cron_schedule_retry_policy_check"
      CHECK ("retry_policy" IS NULL OR
        "retry_policy" IN ('none', 'next-schedule', 'transient-bounded', 'handler-managed'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cron_schedule_max_attempts_check'
  ) THEN
    ALTER TABLE "cron_schedule"
      ADD CONSTRAINT "cron_schedule_max_attempts_check"
      CHECK ("max_attempts" IS NULL OR ("max_attempts" >= 1 AND "max_attempts" <= 20));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cron_schedule_idempotency_check'
  ) THEN
    ALTER TABLE "cron_schedule"
      ADD CONSTRAINT "cron_schedule_idempotency_check"
      CHECK ("idempotency_class" IS NULL OR
        "idempotency_class" IN ('strict', 'guarded', 'convergent', 'non-idempotent'));
  END IF;
END
$$;

--> statement-breakpoint

-- Phase 0 proposals. Legacy mode ignores these fields. Shadow can use them to
-- compare theoretical windows, while ledger remains code-gated until the
-- corresponding policies are explicitly approved.
UPDATE "cron_schedule" AS schedule
SET
  "misfire_policy" = COALESCE(schedule."misfire_policy", policy.misfire_policy),
  "max_catch_up_minutes" = COALESCE(schedule."max_catch_up_minutes", policy.max_catch_up_minutes),
  "retry_policy" = COALESCE(schedule."retry_policy", policy.retry_policy),
  "max_attempts" = COALESCE(schedule."max_attempts", policy.max_attempts),
  "concurrency_group" = COALESCE(schedule."concurrency_group", policy.concurrency_group),
  "idempotency_class" = COALESCE(schedule."idempotency_class", policy.idempotency_class),
  "requires_scheduled_for" = COALESCE(schedule."requires_scheduled_for", policy.requires_scheduled_for)
FROM (
  VALUES
    ('/api/cron/cron-health', 'latest', 60, 'next-schedule', 1, 'monitoring', 'guarded', false),
    ('/api/cron/cron-log-cleanup', 'latest', 1440, 'transient-bounded', 2, 'maintenance', 'convergent', false),
    ('/api/cron/db-backup', 'latest', 7200, 'transient-bounded', 2, 'backup', 'non-idempotent', false),
    ('/api/cron/drain-email-outbox', 'latest', 60, 'handler-managed', 1, 'email', 'strict', false),
    ('/api/cron/enrich-projects', 'latest', 60, 'next-schedule', 1, 'deepseek', 'guarded', false),
    ('/api/cron/generate-alternatives', 'latest', 720, 'next-schedule', 1, 'deepseek', 'convergent', false),
    ('/api/cron/generate-blog-recap', 'latest', 43200, 'transient-bounded', 2, 'deepseek', 'convergent', true),
    ('/api/cron/generate-blog-roundup', 'latest', 10080, 'transient-bounded', 2, 'deepseek', 'guarded', false),
    ('/api/cron/generate-comparisons', 'latest', 720, 'next-schedule', 1, 'deepseek', 'convergent', false),
    ('/api/cron/import-producthunt', 'skip', 0, 'transient-bounded', 2, 'producthunt', 'guarded', false),
    ('/api/cron/moderate-tags', 'latest', 360, 'next-schedule', 1, 'deepseek', 'guarded', false),
    ('/api/cron/quality-check-projects', 'latest', 60, 'next-schedule', 1, 'deepseek', 'guarded', false),
    ('/api/cron/relate-projects', 'latest', 60, 'next-schedule', 1, 'deepseek', 'guarded', false),
    ('/api/cron/send-ongoing-reminders', 'latest', 2880, 'handler-managed', 1, 'email', 'strict', false),
    ('/api/cron/send-winner-notifications', 'latest', 4320, 'handler-managed', 1, 'email', 'strict', false),
    ('/api/cron/simulate-engagement', 'skip', 0, 'next-schedule', 1, 'deepseek', 'guarded', false),
    ('/api/cron/skill-publish', 'latest', 60, 'handler-managed', 1, 'skill-publishing', 'guarded', false),
    ('/api/cron/syndicate-launches', 'latest', 60, 'handler-managed', 1, 'syndication', 'strict', false),
    ('/api/cron/translate-blog', 'latest', 1440, 'next-schedule', 1, 'deepseek', 'convergent', false),
    ('/api/cron/translate-projects', 'latest', 60, 'next-schedule', 1, 'deepseek', 'convergent', false),
    ('/api/cron/update-launches', 'latest', 1440, 'transient-bounded', 2, 'launch-state', 'convergent', false),
    ('/api/cron/webhook-health', 'latest', 360, 'transient-bounded', 2, 'stripe-monitoring', 'non-idempotent', false)
) AS policy(
  path,
  misfire_policy,
  max_catch_up_minutes,
  retry_policy,
  max_attempts,
  concurrency_group,
  idempotency_class,
  requires_scheduled_for
)
WHERE schedule."path" = policy.path;

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "cron_job" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "schedule_id" integer,
  "task_path" text NOT NULL,
  "scheduled_for" timestamptz NOT NULL,
  "execution_mode" text NOT NULL
    CHECK ("execution_mode" IN ('shadow', 'ledger')),
  "status" text NOT NULL DEFAULT 'pending'
    CHECK ("status" IN (
      'pending', 'running', 'retry_wait', 'succeeded',
      'dead_lettered', 'uncertain', 'cancelled'
    )),
  "attempt_count" integer NOT NULL DEFAULT 0 CHECK ("attempt_count" >= 0),
  "available_at" timestamptz NOT NULL DEFAULT now(),
  "lease_owner" text,
  "lease_token" uuid,
  "lease_expires_at" timestamptz,
  "started_at" timestamptz,
  "finished_at" timestamptz,
  "status_code" integer,
  "duration_ms" integer CHECK ("duration_ms" IS NULL OR "duration_ms" >= 0),
  "last_error" text CHECK ("last_error" IS NULL OR char_length("last_error") <= 2000),
  "cron_expression" text NOT NULL,
  "misfire_policy" text NOT NULL
    CHECK ("misfire_policy" IN ('skip', 'latest', 'bounded-all')),
  "max_catch_up_minutes" integer NOT NULL
    CHECK ("max_catch_up_minutes" >= 0 AND "max_catch_up_minutes" <= 43200),
  "retry_policy" text NOT NULL
    CHECK ("retry_policy" IN ('none', 'next-schedule', 'transient-bounded', 'handler-managed')),
  "max_attempts" integer NOT NULL CHECK ("max_attempts" >= 1 AND "max_attempts" <= 20),
  "concurrency_group" text NOT NULL CHECK (char_length("concurrency_group") BETWEEN 1 AND 100),
  "idempotency_class" text NOT NULL
    CHECK ("idempotency_class" IN ('strict', 'guarded', 'convergent', 'non-idempotent')),
  "requires_scheduled_for" boolean NOT NULL,
  "schedule_version" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "cron_job_task_path_check" CHECK (
    "task_path" LIKE '/api/cron/%'
    AND "task_path" <> '/api/cron/dispatch'
    AND position('?' IN "task_path") = 0
    AND position('#' IN "task_path") = 0
    AND position('..' IN "task_path") = 0
    AND position('://' IN "task_path") = 0
  ),
  CONSTRAINT "cron_job_minute_check"
    CHECK (date_trunc('minute', "scheduled_for") = "scheduled_for"),
  CONSTRAINT "cron_job_attempt_budget_check"
    CHECK ("attempt_count" <= "max_attempts"),
  CONSTRAINT "cron_job_running_lease_check" CHECK (
    ("status" = 'running') =
    ("lease_owner" IS NOT NULL AND "lease_token" IS NOT NULL AND "lease_expires_at" IS NOT NULL)
  ),
  CONSTRAINT "cron_job_task_window_unique" UNIQUE ("task_path", "scheduled_for")
);

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "cron_job_claim_idx"
  ON "cron_job" ("status", "available_at", "scheduled_for");

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "cron_job_group_claim_idx"
  ON "cron_job" ("concurrency_group", "status", "available_at");

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "cron_job_lease_idx"
  ON "cron_job" ("status", "lease_expires_at");

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "cron_job_retention_idx"
  ON "cron_job" ("status", "finished_at");

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "cron_materialization_cursor" (
  "id" text PRIMARY KEY CHECK ("id" = 'main'),
  "scanned_through" timestamptz NOT NULL
    CHECK (date_trunc('minute', "scanned_through") = "scanned_through"),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
