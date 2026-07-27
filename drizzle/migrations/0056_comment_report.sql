-- Comment reporting + admin moderation queue (audit 2026-07 feature gap).
--
-- comment_report: one report per (comment, reporter) — the unique index
-- makes report submission naturally idempotent. content_snapshot preserves
-- the comment text at report time so admins can review even after the
-- author edits or the comment is tombstoned.
--
-- fuma_comments.hidden_at/hidden_by: admin "hide" is a TOMBSTONE (content
-- replaced with a placeholder, thread structure preserved) — never a hard
-- delete, so replies stay attached. The comments write path rejects edits
-- to hidden comments (hidden_at IS NULL guard) so the original author
-- can't restore hidden content.

CREATE TABLE IF NOT EXISTS "comment_report" (
  "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "comment_id"        integer NOT NULL REFERENCES "fuma_comments"("id") ON DELETE CASCADE,
  "reporter_id"       text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "reason"            text NOT NULL, -- 'spam' | 'abuse' | 'offtopic' | 'other'
  "details"           text,
  "content_snapshot"  json,
  "status"            text NOT NULL DEFAULT 'pending'
                      CHECK ("status" IN ('pending', 'actioned', 'dismissed')),
  "resolved_by"       text REFERENCES "user"("id") ON DELETE SET NULL,
  "resolved_at"       timestamp,
  "created_at"        timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "comment_report_comment_reporter_uniq"
  ON "comment_report" ("comment_id", "reporter_id");

CREATE INDEX IF NOT EXISTS "comment_report_status_idx"
  ON "comment_report" ("status", "created_at");

ALTER TABLE "fuma_comments" ADD COLUMN IF NOT EXISTS "hidden_at" timestamp;
ALTER TABLE "fuma_comments" ADD COLUMN IF NOT EXISTS "hidden_by" text;
