-- Bookmarks: user-saved projects (audit 2026-07 feature gap).
-- Mirrors the upvote table's structure and integrity model: one row per
-- (user, project), cascade with either side.

CREATE TABLE IF NOT EXISTS "bookmark" (
  "id"         text PRIMARY KEY,
  "user_id"    text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "project_id" text NOT NULL REFERENCES "project"("id") ON DELETE CASCADE,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "bookmark_user_project_uniq"
  ON "bookmark" ("user_id", "project_id");

CREATE INDEX IF NOT EXISTS "bookmark_project_idx"
  ON "bookmark" ("project_id");
