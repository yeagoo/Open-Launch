-- DR now comes from the build-time directories-links snapshot
-- (scripts/sync-directories-links.ts), not a live Ahrefs fetch. Remove the
-- retired refresh-dr cron from the dispatcher so it isn't fired against a
-- now-deleted route. The domain_dr_cache table is left in place (unused, no-op).
DELETE FROM "cron_schedule" WHERE "path" = '/api/cron/refresh-dr';
