-- Tracks failed comparison-page generation attempts so the
-- generate-comparisons cron can skip the same broken pair for 24h
-- instead of retrying every 30 min and burning Tinyfish slots.
--
-- Slug uses the same canonical "<a-slug>-vs-<b-slug>" format as
-- comparison_page so we can look up by either side directly.

CREATE TABLE IF NOT EXISTS "comparison_attempt" (
  "slug"           text PRIMARY KEY,
  "last_failed_at" timestamp NOT NULL DEFAULT now(),
  "attempt_count"  integer NOT NULL DEFAULT 1,
  "error"          text
);

CREATE INDEX IF NOT EXISTS "comparison_attempt_last_failed_at_idx"
  ON "comparison_attempt" ("last_failed_at" DESC);
