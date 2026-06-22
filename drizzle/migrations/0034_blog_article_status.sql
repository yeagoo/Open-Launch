-- Draft/publish state for blog articles. Auto-generated recaps are written as
-- 'draft' (unlisted) for human review; existing + human-authored posts default
-- to 'published'. The blog list + RSS feed filter to 'published'; the per-slug
-- page still renders drafts so they can be previewed by direct URL.
ALTER TABLE "blog_article" ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'published';
