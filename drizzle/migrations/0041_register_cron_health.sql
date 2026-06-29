-- Register the cron self-monitor in the in-app dispatcher. Runs every 30 min;
-- flags tasks whose last successful run is older than their schedule tolerates
-- and detects total dispatcher silence, emailing the admin. Complements the
-- external dead-man heartbeat (CRON_HEARTBEAT_URL) wired into the dispatcher,
-- which covers the case where the whole scheduler is down and this task can't
-- run either. Surfaced in /admin/cron-runs.
INSERT INTO "cron_schedule" (
  "path", "display_name", "cron_expression", "enabled",
  "expected_duration_ms", "description"
) VALUES (
  '/api/cron/cron-health',
  'Cron health monitor',
  '*/30 * * * *',
  true,
  10000,
  'Self-monitor: alerts admin when an enabled cron task has not had a successful run within its schedule tolerance, or when the dispatcher has gone silent (the 2026-06-26 outage class).'
) ON CONFLICT ("path") DO NOTHING;
