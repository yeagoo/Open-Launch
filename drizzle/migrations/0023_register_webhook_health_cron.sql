-- Register the Stripe webhook health-check cron added in this PR.
--
-- The dispatcher (`app/api/cron/dispatch/route.ts`) reads
-- `cron_schedule` to know which paths to call. Without this row the
-- new `/api/cron/webhook-health` route exists but never runs.
--
-- Schedule: every 6h (`0 */6 * * *`). The check is cheap
-- (~1 Stripe API call + ~N DB lookups for N events in 24h) and the
-- 5/11 silent-outage scenario doesn't need sub-hour detection — 6h is
-- a good balance of "early warning" vs "noisy retries".

INSERT INTO "cron_schedule" (
  "path",
  "display_name",
  "cron_expression",
  "enabled",
  "expected_duration_ms",
  "description"
) VALUES (
  '/api/cron/webhook-health',
  'Stripe webhook health',
  '0 */6 * * *',
  true,
  5000,
  'Cross-references Stripe events.list with our directory_order writes. Alerts admin on any gap (catches silent webhook delivery failures like the 2026-05-11 Cloudflare 302 incident).'
) ON CONFLICT ("path") DO NOTHING;
