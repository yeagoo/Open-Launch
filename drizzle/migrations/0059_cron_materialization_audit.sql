-- Phase 11B materialization continuity evidence. One row is written in the
-- same transaction as cron_job inserts and the global cursor advance.

CREATE TABLE IF NOT EXISTS "cron_materialization_run" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "execution_mode" text NOT NULL
    CHECK ("execution_mode" IN ('shadow', 'ledger')),
  "scope_kind" text NOT NULL
    CHECK ("scope_kind" IN ('all', 'task')),
  "task_path" text,
  "scanned_from" timestamptz NOT NULL,
  "scanned_through" timestamptz NOT NULL,
  "cursor_was_clamped" boolean NOT NULL DEFAULT false,
  "planned_count" integer NOT NULL,
  "inserted_count" integer NOT NULL,
  "canary_planned_count" integer,
  "canary_inserted_count" integer,
  "policy_fingerprint" text NOT NULL,
  "canary_policy_fingerprint" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "cron_materialization_run_scope_check" CHECK (
    ("scope_kind" = 'all' AND "task_path" IS NULL)
    OR (
      "scope_kind" = 'task'
      AND "task_path" ~ '^/api/cron/[a-z0-9-]+$'
      AND "task_path" <> '/api/cron/dispatch'
    )
  ),
  CONSTRAINT "cron_materialization_run_range_check" CHECK (
    date_trunc('minute', "scanned_from") = "scanned_from"
    AND date_trunc('minute', "scanned_through") = "scanned_through"
    AND "scanned_from" <= "scanned_through"
  ),
  CONSTRAINT "cron_materialization_run_count_check" CHECK (
    "planned_count" >= 0
    AND "inserted_count" >= 0
    AND "inserted_count" <= "planned_count"
    AND (
      (
        "canary_planned_count" IS NULL
        AND "canary_inserted_count" IS NULL
        AND "canary_policy_fingerprint" IS NULL
      )
      OR (
        "canary_planned_count" >= 0
        AND "canary_inserted_count" >= 0
        AND "canary_policy_fingerprint" IS NOT NULL
        AND "canary_inserted_count" <= "canary_planned_count"
        AND "canary_planned_count" <= "planned_count"
        AND "canary_inserted_count" <= "inserted_count"
      )
    )
  ),
  CONSTRAINT "cron_materialization_run_policy_fingerprint_check" CHECK (
    "policy_fingerprint" ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT "cron_materialization_run_canary_fingerprint_check" CHECK (
    "canary_policy_fingerprint" IS NULL
    OR "canary_policy_fingerprint" ~ '^[0-9a-f]{64}$'
  )
);

--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "cron_materialization_run_scanned_through_unique"
  ON "cron_materialization_run" ("scanned_through");

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "cron_materialization_run_scope_time_idx"
  ON "cron_materialization_run" (
    "execution_mode", "scope_kind", "task_path", "scanned_through"
  );

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "cron_materialization_run_created_at_idx"
  ON "cron_materialization_run" ("created_at");
