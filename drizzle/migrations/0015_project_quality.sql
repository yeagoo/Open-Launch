-- AI quality assessment per project. Low-quality projects are excluded
-- from every AI feature (bot upvotes, bot comments, long descriptions,
-- related-products picks, comparison/alternative pages, translations) and
-- their outbound link is rewritten through /go/[...url] with
-- X-Robots-Tag: noindex,nofollow so we don't pass SEO juice to junk.
ALTER TABLE "project"
  ADD COLUMN IF NOT EXISTS "is_low_quality" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "quality_checked_at" timestamp,
  ADD COLUMN IF NOT EXISTS "quality_score" integer,
  ADD COLUMN IF NOT EXISTS "quality_reason" text;

CREATE INDEX IF NOT EXISTS "project_is_low_quality_idx" ON "project" ("is_low_quality");
CREATE INDEX IF NOT EXISTS "project_quality_checked_at_idx" ON "project" ("quality_checked_at");
