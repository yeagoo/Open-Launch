-- DR (Ahrefs Domain Rating) cache + provider quota tracking.
-- Refreshed every 3 days by /api/cron/refresh-dr; pricing pages
-- read straight from the cache table to avoid blocking on the
-- Ahrefs API at request time.

CREATE TABLE IF NOT EXISTS "domain_dr_cache" (
  "domain"        text PRIMARY KEY,
  "dr"            integer,                       -- 0-100; null when never fetched
  "fetched_at"    timestamp,                     -- when this value was retrieved
  "source"        text,                          -- 'seodataset' | 'apivantage' | 'manual'
  "http_status"   integer,                       -- last HTTP code returned
  "raw_response"  jsonb,                         -- full provider body, for debugging
  "last_attempt_at" timestamp,                   -- includes failed attempts
  "last_error"    text                           -- short error string on last failure
);

-- Index helps the cron pick up the oldest row first when partial
-- runs are interrupted (e.g. timeout mid-batch).
CREATE INDEX IF NOT EXISTS "domain_dr_cache_fetched_at_idx"
  ON "domain_dr_cache" ("fetched_at");

CREATE TABLE IF NOT EXISTS "ahrefs_provider_quota" (
  -- Composite key: provider + UTC year-month bucket. Lets us see
  -- history per month and lets the 80% check key off (provider, current month).
  "provider"      text NOT NULL,                 -- 'seodataset' | 'apivantage'
  "month"         text NOT NULL,                 -- 'YYYY-MM' UTC
  "calls_used"    integer NOT NULL DEFAULT 0,
  "calls_limit"   integer,                       -- learned from x-ratelimit headers
  "last_updated"  timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY ("provider", "month")
);
