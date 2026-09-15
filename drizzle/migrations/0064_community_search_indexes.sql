-- migrate: no-transaction
-- Community search is literal contains matching. Queries in
-- lib/community/queries.ts must keep the lower(title || body) expression
-- byte-for-byte compatible with this partial trigram index.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint

CREATE INDEX CONCURRENTLY IF NOT EXISTS community_thread_public_text_trgm_idx
  ON community_thread USING gin (
    (lower(coalesce(title, '') || ' ' || body)) gin_trgm_ops
  )
  WHERE lifecycle = 'published' AND moderation = 'public';
--> statement-breakpoint

-- The composer serializes only the 100 most recently updated public products.
-- This partial ordering index avoids sorting the whole directory for each
-- composer request as the product catalogue grows.
CREATE INDEX CONCURRENTLY IF NOT EXISTS project_public_status_updated_idx
  ON project (updated_at DESC, name ASC, id ASC)
  WHERE launch_status IN ('ongoing', 'launched');
