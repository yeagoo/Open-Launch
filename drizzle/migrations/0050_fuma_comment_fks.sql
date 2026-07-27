-- Referential integrity for the fuma-comment tables (audit 2026-07).
--
-- Today: fuma_comments.author / fuma_rates.user_id reference nothing, so
-- deleting a user leaves their comments and likes behind forever, and
-- deleting a comment leaves fuma_rates rows pointing at it.
--
-- All constraints are added NOT VALID so existing orphan rows (they exist
-- in production) don't make the migration fail — new writes are enforced
-- immediately. Run scripts/ops/cleanup-comment-orphans.ts --apply against
-- production, then VALIDATE each constraint manually:
--
--   ALTER TABLE fuma_rates VALIDATE CONSTRAINT fuma_rates_user_id_fkey;
--   ALTER TABLE fuma_rates VALIDATE CONSTRAINT fuma_rates_comment_id_fkey;
--   ALTER TABLE fuma_comments VALIDATE CONSTRAINT fuma_comments_thread_fkey;
--
-- Notes on the choices:
--   * fuma_comments.author gets NO FK. better-auth 1.6 databaseHooks have
--     no user.delete hook, and removeUser must not be blocked by comment
--     history. Orphan authors are anonymized by the cleanup script /
--     admin moderation flow instead (tombstone, same mechanism as comment
--     hiding in the report queue work).
--   * thread -> id ON DELETE SET NULL: hard-deleting a root comment turns
--     its replies into new roots instead of leaving them pointing at a
--     nonexistent thread id. (Admin hiding uses tombstones, so hard delete
--     is rare.)

ALTER TABLE "fuma_rates"
  ADD CONSTRAINT "fuma_rates_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE NOT VALID;

ALTER TABLE "fuma_rates"
  ADD CONSTRAINT "fuma_rates_comment_id_fkey"
  FOREIGN KEY ("comment_id") REFERENCES "fuma_comments"("id") ON DELETE CASCADE NOT VALID;

ALTER TABLE "fuma_comments"
  ADD CONSTRAINT "fuma_comments_thread_fkey"
  FOREIGN KEY ("thread") REFERENCES "fuma_comments"("id") ON DELETE SET NULL NOT VALID;
