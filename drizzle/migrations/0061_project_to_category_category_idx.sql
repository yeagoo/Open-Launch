-- migrate: no-transaction
-- Category pages filter project_to_category by category_id. The composite
-- primary key starts with project_id, so it cannot efficiently serve that
-- lookup on a large junction table.
--
-- CREATE INDEX CONCURRENTLY avoids blocking writes on production. If this
-- migration is interrupted, PostgreSQL can leave an INVALID index that makes
-- IF NOT EXISTS skip the retry. Before applying or retrying, inspect it with:
--
--   SELECT indexrelid::regclass, indisvalid, indisready
--   FROM pg_index
--   WHERE indexrelid =
--     to_regclass('public.project_to_category_category_id_idx');
--
-- Drop an invalid remnant with DROP INDEX CONCURRENTLY before retrying.

CREATE INDEX CONCURRENTLY IF NOT EXISTS "project_to_category_category_id_idx"
  ON "project_to_category" USING btree ("category_id");
