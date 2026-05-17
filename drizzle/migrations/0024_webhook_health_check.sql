-- Persistent snapshots of each /api/cron/webhook-health run.
--
-- The cron itself emails admin only on `degraded` to avoid noise on the
-- 99% healthy days. But the admin still wants a quick "what's the last
-- N runs look like" view — without re-running the check or scrolling
-- the email box. This table holds the summary per run; the admin page
-- at /admin/webhook-health renders the last 50.
--
-- Retention: cron_log_cleanup already trims cron_run_log; we'll wire a
-- similar trim for this table in a follow-up if it grows past a few
-- thousand rows (4 runs/day * 1 year = 1460 rows — tiny).

CREATE TABLE IF NOT EXISTS "webhook_health_check" (
  "id"                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "ran_at"               timestamp NOT NULL DEFAULT now(),
  "status"               text NOT NULL CHECK ("status" IN ('healthy', 'degraded', 'error')),
  "window_hours"         integer NOT NULL,
  "total_events"         integer NOT NULL DEFAULT 0,
  "directory_events"     integer NOT NULL DEFAULT 0,
  "matched"              integer NOT NULL DEFAULT 0,
  "unmatched"            integer NOT NULL DEFAULT 0,
  "skipped_too_recent"   integer NOT NULL DEFAULT 0,
  "preview_session_ids"  text[],
  "error_message"        text
);

CREATE INDEX IF NOT EXISTS "webhook_health_check_ran_at_idx"
  ON "webhook_health_check" ("ran_at" DESC);
