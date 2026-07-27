-- Durable email outbox + its drain cron (audit 2026-07).
--
-- Problem: the daily notification crons (winner badges, launch reminders)
-- sent mail inline. A partial failure meant the failed recipients were
-- silently lost (route still returned 200), while a whole-run retry would
-- double-send to the successful ones — and with the embedded scheduler the
-- next attempt was 24h away regardless.
--
-- Design: senders ENQUEUE one row per (event, recipient) with a stable
-- event_key, then drain. Enqueue is idempotent via the event_key UNIQUE;
-- sends carry the event_key as Resend's Idempotency-Key so a crash between
-- "Resend accepted" and "row marked sent" cannot double-deliver. The drain
-- cron retries failed rows every 10 minutes, and the senders select over a
-- multi-day compensation window so a missed day is caught by the next run.

CREATE TABLE IF NOT EXISTS "email_outbox" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Stable dedupe key, e.g. winner:2026-07-26:<projectId>. Also sent to
  -- Resend as the Idempotency-Key.
  "event_key"   text NOT NULL UNIQUE,
  "kind"        text NOT NULL,           -- 'winner_badge' | 'launch_reminder'
  "payload"     json NOT NULL,           -- everything the template needs
  "status"      text NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending', 'sent', 'failed')),
  "attempts"    integer NOT NULL DEFAULT 0,
  "last_error"  text,
  "created_at"  timestamp NOT NULL DEFAULT now(),
  "sent_at"     timestamp
);

CREATE INDEX IF NOT EXISTS "email_outbox_status_idx"
  ON "email_outbox" ("status", "created_at");

-- Drain every 10 minutes: retries failed sends and flushes anything a
-- sender enqueued but couldn't deliver inline.
INSERT INTO "cron_schedule" (
  "path",
  "display_name",
  "cron_expression",
  "enabled",
  "expected_duration_ms",
  "description"
) VALUES (
  '/api/cron/drain-email-outbox',
  'Drain email outbox',
  '*/10 * * * *',
  true,
  30000,
  'Retries failed/undelivered notification emails from the durable email_outbox queue (idempotent per event_key).'
)
ON CONFLICT ("path") DO NOTHING;
