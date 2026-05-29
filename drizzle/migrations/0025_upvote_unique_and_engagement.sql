-- migrate: no-transaction
-- Remove historical duplicate votes from the same user on the same project
-- before enforcing the invariant at the database layer.
DELETE FROM "upvote" newer
USING "upvote" older
WHERE newer."user_id" = older."user_id"
  AND newer."project_id" = older."project_id"
  AND (
    newer."created_at" > older."created_at"
    OR (
      newer."created_at" = older."created_at"
      AND newer."id" > older."id"
    )
  );
--> statement-breakpoint
DROP INDEX CONCURRENTLY IF EXISTS "upvote_user_project_unique_idx";
--> statement-breakpoint
CREATE UNIQUE INDEX CONCURRENTLY "upvote_user_project_unique_idx"
  ON "upvote" USING btree ("user_id", "project_id");
--> statement-breakpoint
DROP INDEX CONCURRENTLY IF EXISTS "upvote_project_id_idx";
--> statement-breakpoint
CREATE INDEX CONCURRENTLY "upvote_project_id_idx"
  ON "upvote" USING btree ("project_id");
--> statement-breakpoint
UPDATE "cron_schedule"
SET
  "description" = 'Distribute one daily bot upvote per bot across the current launch window + bot comments + stale comment rewrite',
  "updated_at" = now()
WHERE "path" = '/api/cron/simulate-engagement';
