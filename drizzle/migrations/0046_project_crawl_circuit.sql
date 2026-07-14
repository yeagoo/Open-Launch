-- Quarantine websites that repeatedly fail at the crawler layer. This state is
-- project-scoped (not comparison-pair scoped), preventing one dead URL from
-- consuming Tinyfish quota across many comparison and alternatives jobs.

ALTER TABLE "project"
  ADD COLUMN IF NOT EXISTS "crawl_failure_count" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "crawl_last_failed_at" timestamp,
  ADD COLUMN IF NOT EXISTS "crawl_suspended_until" timestamp,
  ADD COLUMN IF NOT EXISTS "crawl_last_error" text;

CREATE INDEX IF NOT EXISTS "project_crawl_suspended_until_idx"
  ON "project" ("crawl_suspended_until");
