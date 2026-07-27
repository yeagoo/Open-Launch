-- In-app notification center (audit 2026-07 feature gap).
--
-- One row per (recipient, event). The dedupe_key UNIQUE makes producers
-- idempotent: milestone notifications fire from vote paths that can race,
-- and launch-status notifications from a cron that may rerun — the same
-- logical event always maps to one row (dedupe_key IS NULL rows are never
-- deduped; unique indexes ignore NULLs).

CREATE TABLE IF NOT EXISTS "notification" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"     text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "type"        text NOT NULL, -- 'comment' | 'reply' | 'mention' | 'upvote_milestone' | 'launch_status'
  "actor_id"    text REFERENCES "user"("id") ON DELETE SET NULL,
  "project_id"  text REFERENCES "project"("id") ON DELETE CASCADE,
  -- Logical pointer to fuma_comments.id. No FK by design (matches the
  -- fuma tables' integrity style, and a hard-deleted comment must not
  -- take the notification with it).
  "comment_id"  integer,
  -- Small JSON bag: { excerpt, milestone, oldStatus, newStatus }
  "metadata"    json,
  "dedupe_key"  text UNIQUE,
  "read_at"     timestamp,
  "created_at"  timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "notification_user_created_idx"
  ON "notification" ("user_id", "created_at" DESC);

-- Unread-count lookups hit this constantly (the nav bell).
CREATE INDEX IF NOT EXISTS "notification_user_unread_idx"
  ON "notification" ("user_id") WHERE "read_at" IS NULL;
