-- Cross-site launch syndication queue.
--
-- One row per (directory_order × target partner site). The Stripe webhook
-- (`handleDirectoryOrderCompleted`) inserts rows when a Plus/Pro/Ultra order
-- is paid; the `/api/cron/syndicate-launches` worker drains them, POSTing each
-- to the partner site's `/api/external/launch` endpoint with retry/backoff,
-- and flips the directory_order to `fulfilled` once every site succeeds.
--
-- The (order_id, site) UNIQUE index is the idempotency key: the webhook can
-- fire enqueue multiple times (Stripe retries, async_payment_succeeded) and
-- only the first insert per site sticks.

CREATE TABLE IF NOT EXISTS "launch_syndication" (
  "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "order_id"         uuid NOT NULL REFERENCES "directory_order"("id") ON DELETE CASCADE,
  "project_id"       text NOT NULL REFERENCES "project"("id") ON DELETE CASCADE,
  "site"             text NOT NULL,
  "tier"             text NOT NULL,
  "status"           text NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending', 'sent', 'failed')),
  "attempts"         integer NOT NULL DEFAULT 0,
  "last_error"       text,
  "external_id"      text,
  "external_url"     text,
  "next_attempt_at"  timestamp,
  "sent_at"          timestamp,
  "created_at"       timestamp NOT NULL DEFAULT now(),
  "updated_at"       timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "launch_syndication_order_site_uniq"
  ON "launch_syndication" ("order_id", "site");

CREATE INDEX IF NOT EXISTS "launch_syndication_status_idx"
  ON "launch_syndication" ("status", "next_attempt_at");

-- Register the drain worker with the cron dispatcher. Runs every 2 minutes;
-- the worker is idempotent and only touches due rows, so the cadence only
-- bounds how quickly a paid listing appears on partner sites.
INSERT INTO "cron_schedule" (
  "path",
  "display_name",
  "cron_expression",
  "enabled",
  "expected_duration_ms",
  "description"
) VALUES (
  '/api/cron/syndicate-launches',
  'Syndicate paid launches',
  '*/2 * * * *',
  true,
  15000,
  'Drains launch_syndication: POSTs paid Plus/Pro/Ultra listings to partner sites (bigkr, mf8, hicyou) at /api/external/launch with retry/backoff, then marks the directory_order fulfilled once all sites succeed.'
) ON CONFLICT ("path") DO NOTHING;
