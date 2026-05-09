-- Per-locale tagline (one-line marketing summary, ≤60 chars).
-- Lives on project_translation alongside `description` so the
-- translate-projects cron can fan out the source-locale string to all
-- supported locales the same way it does for description.
-- Nullable: existing 5000+ rows have no tagline; UI falls back to
-- description's one-liner summary.

ALTER TABLE "project_translation"
  ADD COLUMN IF NOT EXISTS "tagline" text;

ALTER TABLE "project_translation"
  ADD COLUMN IF NOT EXISTS "tagline_generated_at" timestamp;
