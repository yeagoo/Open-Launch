-- Register the DR refresh job with the cron dispatcher.
--
-- The `/api/cron/refresh-dr` route and the `domain_dr_cache` table have
-- existed since 0020, and the code comments all say it "runs every 3 days",
-- but the row that actually makes the dispatcher call it was never inserted.
-- Result: DR values on the home + pricing pages went stale because nothing
-- ever refreshed the cache. This adds the missing schedule row.
--
-- Schedule: 04:00 UTC every 3rd day-of-month (`0 4 */3 * *`). Low-traffic
-- hour, and DR moves slowly so 3-day granularity is plenty. The job fetches
-- ~12 domains, now primarily via Ahrefs' free public endpoint (no API key),
-- so it no longer depends on a RapidAPI key being present.

INSERT INTO "cron_schedule" (
  "path",
  "display_name",
  "cron_expression",
  "enabled",
  "expected_duration_ms",
  "description"
) VALUES (
  '/api/cron/refresh-dr',
  'Refresh domain ratings',
  '0 4 */3 * *',
  true,
  60000,
  'Refreshes Ahrefs Domain Rating for tracked sites into domain_dr_cache (home + pricing DR badges). Primary source is the free public Ahrefs endpoint; RapidAPI proxies are failover.'
) ON CONFLICT ("path") DO NOTHING;
