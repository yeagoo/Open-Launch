-- Register the database-backup job in the in-app cron dispatcher.
-- Runs every 3rd day at 02:00 UTC; surfaced in /admin/cron-runs. The route
-- (/api/cron/db-backup) takes a logical Postgres dump of the public schema,
-- gzips + envelope-encrypts it, uploads it to the private R2 backup bucket,
-- then prunes backups older than 30 days. Idempotent via ON CONFLICT.
INSERT INTO "cron_schedule" (
  "path", "display_name", "cron_expression", "enabled",
  "expected_duration_ms", "description"
) VALUES (
  '/api/cron/db-backup',
  'Database backup',
  '0 2 */3 * *',
  true,
  120000,
  'Logical Postgres backup (gzip + envelope-encrypted) to the private R2 backup bucket; 30-day retention.'
) ON CONFLICT ("path") DO NOTHING;
