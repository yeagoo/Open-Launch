-- Track when the relate-projects cron last attempted a project so projects with
-- no overlap pool aren't re-evaluated every tick forever.
ALTER TABLE "project"
  ADD COLUMN IF NOT EXISTS "related_attempted_at" timestamp;

-- Prevent two concurrent relate-projects runs from inserting duplicate ranks
-- for the same subject. The second run will hit a unique violation and abort
-- its insert (the catch handler logs and continues).
DO $$ BEGIN
  ALTER TABLE "project_related"
    ADD CONSTRAINT "project_related_project_rank_uniq" UNIQUE ("project_id", "rank");
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
