-- migrate: no-transaction
-- Full-text + typo-tolerant search indexes (audit 2026-07; pg_trgm already
-- enabled by 0013). Search previously matched only project.name with ILIKE.
--
-- IMPORTANT: expression indexes only fire when the query repeats the EXACT
-- same expression. The query layer (lib/search-projects.ts) builds its
-- tsvector with the identical string used below — change both together.
--
--   project_name_trgm_idx          — similarity() on name (typo tolerance;
--                                    trigram works for CJK where 'simple'
--                                    tsvector can't segment)
--   project_fts_idx                — to_tsvector over name + tag-stripped
--                                    description ('simple' config: safe for
--                                    all 8 site languages)
--   project_translation_src_tagline_trgm_idx — similarity() on source tagline
--   project_translation_src_tagline_fts_idx  — tsvector on source tagline

CREATE INDEX CONCURRENTLY IF NOT EXISTS "project_name_trgm_idx"
  ON "project" USING gin ("name" gin_trgm_ops);
--> statement-breakpoint

CREATE INDEX CONCURRENTLY IF NOT EXISTS "project_fts_idx"
  ON "project" USING gin (
    to_tsvector('simple', "name" || ' ' || regexp_replace("description", '<[^>]*>', ' ', 'g'))
  );
--> statement-breakpoint

CREATE INDEX CONCURRENTLY IF NOT EXISTS "project_translation_src_tagline_trgm_idx"
  ON "project_translation" USING gin ("tagline" gin_trgm_ops)
  WHERE "is_source" AND "tagline" IS NOT NULL;
--> statement-breakpoint

CREATE INDEX CONCURRENTLY IF NOT EXISTS "project_translation_src_tagline_fts_idx"
  ON "project_translation" USING gin (to_tsvector('simple', coalesce("tagline", '')))
  WHERE "is_source";
