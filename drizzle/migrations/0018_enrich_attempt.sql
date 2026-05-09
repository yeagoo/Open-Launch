-- Failure tracking + cooldown for the enrich-projects cron.
-- Without this, the cron's `LIMIT 3` query (no ORDER BY) returns the same
-- 3 broken URLs on every tick — burning Tinyfish slots and never touching
-- the rest of the candidate pool. The columns let us stamp every attempt
-- (success or failure) and exclude recently-attempted projects.

ALTER TABLE "project_translation"
  ADD COLUMN IF NOT EXISTS "long_description_attempted_at" timestamp;

ALTER TABLE "project_translation"
  ADD COLUMN IF NOT EXISTS "long_description_attempt_count" integer NOT NULL DEFAULT 0;

ALTER TABLE "project_translation"
  ADD COLUMN IF NOT EXISTS "long_description_last_error" text;

-- Index helps the candidate-selection query skip recently-attempted rows
-- without a full sequential scan as the table grows.
CREATE INDEX IF NOT EXISTS "project_translation_long_desc_attempt_idx"
  ON "project_translation" ("long_description_attempted_at");
