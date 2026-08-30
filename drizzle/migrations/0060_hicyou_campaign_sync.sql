-- Durable status-sync outbox for Hicyou's external Campaign dashboard.
-- `source_updated_at` is the latest relevant aat.ee order/placement change;
-- `version` prevents an in-flight sender from acknowledging a newer update.

CREATE TABLE IF NOT EXISTS "hicyou_campaign_sync" (
  "order_id"          uuid PRIMARY KEY REFERENCES "directory_order"("id") ON DELETE CASCADE,
  "source_updated_at" timestamp NOT NULL,
  "version"           integer NOT NULL DEFAULT 1,
  "status"            text NOT NULL DEFAULT 'pending'
                        CHECK ("status" IN ('pending', 'sending', 'failed', 'sent')),
  "attempts"          integer NOT NULL DEFAULT 0,
  "last_error"        text,
  "next_attempt_at"   timestamp,
  "last_synced_at"    timestamp,
  "created_at"        timestamp NOT NULL DEFAULT now(),
  "updated_at"        timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "hicyou_campaign_sync_due_idx"
  ON "hicyou_campaign_sync" ("status", "next_attempt_at");
