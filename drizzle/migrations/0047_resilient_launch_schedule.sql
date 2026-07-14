-- update-launches is idempotent. Running it every ten minutes means a pod or
-- external scheduler that was unavailable at exactly 08:00 UTC catches up as
-- soon as it returns instead of leaving the homepage empty for a full day.

UPDATE "cron_schedule"
SET
  "cron_expression" = '*/10 * * * *',
  "description" = 'Idempotent launch-state reconciliation every 10 min (daily boundary at 08:00 UTC)',
  "updated_at" = now()
WHERE "path" = '/api/cron/update-launches';
