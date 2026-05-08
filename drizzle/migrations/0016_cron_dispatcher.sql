-- Single-dispatcher cron orchestration. cron-job.org calls
-- /api/cron/dispatch every minute; the dispatcher reads cron_schedule
-- and fires each due task in parallel, writing one cron_run_log row
-- per task per tick.
--
-- Schedule lives in the DB (not code) so admin can edit cron expressions
-- and toggle tasks on/off without a deploy.

CREATE TABLE IF NOT EXISTS "cron_schedule" (
  "id"              serial PRIMARY KEY,
  "path"            text NOT NULL UNIQUE,
  "display_name"    text NOT NULL,
  "cron_expression" text NOT NULL,
  "enabled"         boolean NOT NULL DEFAULT true,
  "expected_duration_ms" integer,
  "description"     text,
  "created_at"      timestamp NOT NULL DEFAULT now(),
  "updated_at"      timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "cron_run_log" (
  "id"            serial PRIMARY KEY,
  "dispatched_at" timestamp NOT NULL DEFAULT now(),
  "task_path"     text NOT NULL,
  "status_code"   integer NOT NULL,
  "duration_ms"   integer NOT NULL,
  "error"         text
);

CREATE INDEX IF NOT EXISTS "cron_run_log_dispatched_idx"
  ON "cron_run_log" ("dispatched_at" DESC);

CREATE INDEX IF NOT EXISTS "cron_run_log_task_idx"
  ON "cron_run_log" ("task_path", "dispatched_at" DESC);

-- Seed the existing 12 cron tasks. Path is unique so re-running is a no-op.
INSERT INTO "cron_schedule" (path, display_name, cron_expression, enabled, expected_duration_ms, description)
VALUES
  ('/api/cron/translate-projects',        'Translate projects',         '*/5 * * * *',  true,  60000,  'Translate descriptions + long_description into 8 locales'),
  ('/api/cron/enrich-projects',           'Enrich projects',            '*/5 * * * *',  true,  90000,  'Crawl4AI + DeepSeek SEO long descriptions'),
  ('/api/cron/relate-projects',           'Relate projects',            '*/5 * * * *',  true,  30000,  'Pick up to 4 related products per project via DeepSeek'),
  ('/api/cron/quality-check-projects',    'Quality check',              '*/5 * * * *',  true,  20000,  'Classify projects 0-100; flag <30 as low quality'),
  ('/api/cron/simulate-engagement',       'Simulate engagement',        '0 */2 * * *',  true,  60000,  'Bot upvotes (1:1 amp) + bot comments + stale comment rewrite'),
  ('/api/cron/moderate-tags',             'Moderate tags',              '0 */3 * * *',  true,  20000,  'AI moderation of pending tags'),
  ('/api/cron/generate-comparisons',      'Generate comparisons',       '15,45 * * * *',true,  60000,  'AI-generated A vs B comparison pages per category'),
  ('/api/cron/generate-alternatives',     'Generate alternatives',      '5,35 * * * *', true,  90000,  'AI-generated alternatives directory pages per project'),
  ('/api/cron/update-launches',           'Update launches',            '0 8 * * *',    true,  30000,  'Daily promotion: scheduled -> ongoing -> launched'),
  ('/api/cron/send-ongoing-reminders',    'Ongoing-launch reminders',   '5 8 * * *',    true,  20000,  'Email project owners that their launch is live'),
  ('/api/cron/send-winner-notifications', 'Winner notifications',       '0 9 * * *',    true,  20000,  'Email yesterday''s top-3 with winner badges'),
  ('/api/cron/import-producthunt',        'Import Product Hunt',        '0 0 * * *',    true,  60000,  'Daily Product Hunt scrape into our catalogue'),
  ('/api/cron/cron-log-cleanup',          'Cron-log cleanup',           '15 0 * * *',   true,  5000,   'Delete cron_run_log rows older than 90 days')
ON CONFLICT (path) DO NOTHING;
