-- Enforce the free Skill channel's permanent per-domain dedupe at the database
-- layer, not only through the Redis soft lock used during submission.
CREATE UNIQUE INDEX IF NOT EXISTS "skill_submission_domain_uniq"
  ON "skill_submission" ("domain");
