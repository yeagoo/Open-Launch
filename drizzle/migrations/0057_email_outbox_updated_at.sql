-- email_outbox.updated_at: stamped on every drain attempt. The drain
-- route only alerts on dead letters whose last attempt is fresh (< 24h),
-- so a permanently-exhausted row stops paging after a day instead of
-- keeping cron monitoring red forever (cross-phase finding, 2026-07).

ALTER TABLE "email_outbox"
  ADD COLUMN IF NOT EXISTS "updated_at" timestamp NOT NULL DEFAULT now();
